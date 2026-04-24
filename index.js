const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://stechnest.com",
    "https://www.stechnest.com"
  ],
  credentials: true
}));
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lfgd0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
    try {
        await client.connect();

        const userCollection = client.db("stTechDb").collection('user');
        const memberCollection = client.db("stTechDb").collection('members');
        const portfolioCollection = client.db("stTechDb").collection('projects');
        const UserWorkCollection = client.db("stTechDb").collection('Works');

        app.post('/api/works', async (req, res) => {
            const data = req.body;

            if (!data.workName || !data.workCategory || !data.workDetails || !data.submitterName || !data.submitterEmail || !data.workLink) {
                return res.status(400).json({
                    message: "কাজের নাম, ক্যাটাগরি, বিবরণ, নাম, ইমেইল এবং কাজের লিঙ্ক আবশ্যক।"
                });
            }

            try {
                const newWork = {
                    ...data,
                    submissionDate: new Date(),
                    status: 'pending'
                };

                const result = await UserWorkCollection.insertOne(newWork);

    res.status(201).json({
      message: "কাজ সফলভাবে জমা হয়েছে।",
      insertedId: result.insertedId,
      data: newWork,
    });
  } catch (err) {
    console.error("/api/works POST error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


        app.get('/api/works', async (req, res) => {
            try {
                // Query Parameter থেকে 'email' নেওয়া হচ্ছে
                const email = req.query.email;

                let filter = {};

                if (email) {
                    filter = { submitterEmail: email };
                    console.log(`Filtering works for user: ${email}`);
                }
                else {
                    console.log("Fetching all works (Admin View).");
                }

                const works = await UserWorkCollection.find(filter).sort({ submissionDate: -1 }).toArray();
                res.status(200).json(works);

            } catch (error) {
                console.error("Error fetching works:", error);
                res.status(500).json({
                    message: 'কাজের তালিকা আনতে ব্যর্থ হয়েছে।'
                });
            }
        });


        app.delete('/api/works/:id', async (req, res) => {
            const id = req.params.id;

            if (!ObjectId.isValid(id)) {
                return res.status(400).json({
                    message: "অবৈধ কাজের আইডি ফরম্যাট। সঠিক ID দিন।"
                });
            }

            try {
                const query = { _id: new ObjectId(id) };
                const result = await UserWorkCollection.deleteOne(query);

                if (result.deletedCount === 0) {
                    return res.status(404).json({
                        message: "নির্দিষ্ট আইডি সহ কোনো কাজ পাওয়া যায়নি। মুছে ফেলা সম্ভব নয়।"
                    });
                }

                res.status(200).json({
                    message: 'কাজটি সফলভাবে মুছে ফেলা হয়েছে।',
                    deletedId: id
                });

            } catch (error) {
                console.error("Error deleting work:", error);
                res.status(500).json({
                    message: 'ডাটাবেস থেকে কাজটি মুছতে ব্যর্থ হয়েছে। অভ্যন্তরীণ সার্ভার ত্রুটি।'
                });
            }
        });

// ----------- JWT -----------
app.post("/jwt", async (req, res) => {
  try {
    const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token });
  } catch (err) {
    console.error("/jwt error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ----------- Users -----------
app.get("/user", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userCollection } = await getCollections();
    const users = await userCollection.find().toArray();
    res.json(users);
  } catch (err) {
    console.error("/user GET error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/user/admin/:email", verifyToken, async (req, res) => {
  try {
    const email = req.params.email;
    if (email !== req.decoded.email)
      return res.status(403).json({ message: "Forbidden" });

    const { userCollection } = await getCollections();
    const user = await userCollection.findOne({ email });
    res.json({ admin: user?.role === "admin" });
  } catch (err) {
    console.error("/user/admin/:email GET error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/user", async (req, res) => {
  try {
    const user = req.body;
    const { userCollection } = await getCollections();
    const exists = await userCollection.findOne({ email: user.email });
    if (exists) return res.json({ message: "User already exists" });

    const result = await userCollection.insertOne(user);
    res.json(result);
  } catch (err) {
    console.error("/user POST error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.patch("/user/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userCollection } = await getCollections();
    const result = await userCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { role: "admin" } }
    );
    res.json(result);
  } catch (err) {
    console.error("/user/admin/:id PATCH error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { userCollection } = await getCollections();
    const result = await userCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.json(result);
  } catch (err) {
    console.error("/user/:id DELETE error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ----------- Members -----------
app.get("/members", async (req, res) => {
  try {
    const { memberCollection } = await getCollections();
    const members = await memberCollection.find().toArray();
    res.json(members);
  } catch (err) {
    console.error("/members GET error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/members/count", async (req, res) => {
  try {
    const { memberCollection } = await getCollections();
    const count = await memberCollection.countDocuments();
    res.json({ count });
  } catch (err) {
    console.error("/members/count GET error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});



        // POST new member
        app.post('/members', async (req, res) => {
            const member = req.body;
            const result = await memberCollection.insertOne(member);
            res.send(result);
        });


        // DELETE member by ID
        app.delete('/members/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await memberCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 1) {
                    res.send({ success: true });
                } else {
                    res.status(404).send({ error: "Member not found" });
                }
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to delete member" });
            }
        });



        // portfolio related apis
        app.get('/projects', async (req, res) => {
            const result = await portfolioCollection.find().toArray();
            res.send(result);
        });


        // POST new member
        app.post('/projects', async (req, res) => {
            const member = req.body;
            const result = await portfolioCollection.insertOne(member);
            res.send(result);
        });


        // DELETE member by ID
        app.delete('/projects/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const result = await portfolioCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount === 1) {
                    res.send({ success: true });
                } else {
                    res.status(404).send({ error: "project not found" });
                }
            } catch (err) {
                console.error(err);
                res.status(500).send({ error: "Failed to delete project " });
            }
        });











        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send("st tech is sitting..")
});

app.listen(port, () => {
    console.log(`St Tech is running on port ${port}`);
});