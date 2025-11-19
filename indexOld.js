const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const cors = require("cors");
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lfgd0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

    const userCollection = client.db("stTechDb").collection("user");
    const memberCollection = client.db("stTechDb").collection("members");
    const portfolioCollection = client.db("stTechDb").collection("projects");
    const UserWorkCollection = client.db("stTechDb").collection("Works");

    app.post("/api/works", async (req, res) => {
      const data = req.body;

      if (
        !data.workName ||
        !data.workCategory ||
        !data.workDetails ||
        !data.submitterName ||
        !data.submitterEmail ||
        !data.workLink
      ) {
        return res.status(400).json({
          message:
            "কাজের নাম, ক্যাটাগরি, বিবরণ, নাম, ইমেইল এবং কাজের লিঙ্ক আবশ্যক।",
        });
      }

      try {
        const newWork = {
          ...data,
          submissionDate: new Date(),
          status: "pending",
        };

        const result = await UserWorkCollection.insertOne(newWork);

        res.status(201).json({
          message: "কাজটি সফলভাবে জমা হয়েছে।",
          insertedId: result.insertedId,
          data: newWork,
        });
      } catch (error) {
        console.error("Error submitting work:", error);
        res.status(500).json({
          message: "ডাটাবেসে কাজ জমা দিতে ব্যর্থ হয়েছে।",
        });
      }
    });

    app.get("/api/works", async (req, res) => {
      try {
        // Query Parameter থেকে 'email' নেওয়া হচ্ছে
        const email = req.query.email;

        let filter = {};

        if (email) {
          filter = { submitterEmail: email };
          console.log(`Filtering works for user: ${email}`);
        } else {
          console.log("Fetching all works (Admin View).");
        }

        const works = await UserWorkCollection.find(filter)
          .sort({ submissionDate: -1 })
          .toArray();
        res.status(200).json(works);
      } catch (error) {
        console.error("Error fetching works:", error);
        res.status(500).json({
          message: "কাজের তালিকা আনতে ব্যর্থ হয়েছে।",
        });
      }
    });

    app.delete("/api/works/:id", async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "অবৈধ কাজের আইডি ফরম্যাট। সঠিক ID দিন।",
        });
      }

      try {
        const query = { _id: new ObjectId(id) };
        const result = await UserWorkCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res.status(404).json({
            message:
              "নির্দিষ্ট আইডি সহ কোনো কাজ পাওয়া যায়নি। মুছে ফেলা সম্ভব নয়।",
          });
        }

        res.status(200).json({
          message: "কাজটি সফলভাবে মুছে ফেলা হয়েছে।",
          deletedId: id,
        });
      } catch (error) {
        console.error("Error deleting work:", error);
        res.status(500).json({
          message:
            "ডাটাবেস থেকে কাজটি মুছতে ব্যর্থ হয়েছে। অভ্যন্তরীণ সার্ভার ত্রুটি।",
        });
      }
    });

    // jwt related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      console.log("inside verify token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
      });

      // next();
    };

    // user veify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // user related apis
    app.get("/user", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/user/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }

      res.send({ admin });
    });

    app.post("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exist", insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/user/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // GET all members
    app.get("/members", async (req, res) => {
      const result = await memberCollection.find().toArray();
      res.send(result);
    });

    app.get("/members/count", async (req, res) => {
      try {
        const count = await memberCollection.countDocuments();
        res.json({ count }); // { count: 10 } for example
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to get members count" });
      }
    });

    // POST new member
    app.post("/members", async (req, res) => {
      const member = req.body;
      const result = await memberCollection.insertOne(member);
      res.send(result);
    });

    // DELETE member by ID
    app.delete("/members/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await memberCollection.deleteOne({
          _id: new ObjectId(id),
        });
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
    app.get("/projects", async (req, res) => {
      const result = await portfolioCollection.find().toArray();
      res.send(result);
    });

    // POST new member
    app.post("/projects", async (req, res) => {
      const member = req.body;
      const result = await portfolioCollection.insertOne(member);
      res.send(result);
    });

    // DELETE member by ID
    app.delete("/projects/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await portfolioCollection.deleteOne({
          _id: new ObjectId(id),
        });
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
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("st tech is sitting..");
});

app.listen(port, () => {
  console.log(`St Tech is running on port ${port}`);
});
