const express = require("express");
const serverless = require("serverless-http");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lfgd0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let userCollection;
let memberCollection;
let portfolioCollection;
let UserWorkCollection;

async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
    console.log("DB Connected");

    userCollection = client.db("stTechDb").collection("user");
    memberCollection = client.db("stTechDb").collection("members");
    portfolioCollection = client.db("stTechDb").collection("projects");
    UserWorkCollection = client.db("stTechDb").collection("Works");
  }
}
connectDB();

// --------------------------------------------
//               ROUTES START
// --------------------------------------------

// root route
app.get("/", (req, res) => {
  res.send("st tech serverless backend is running...");
});

// POST work
app.post("/api/works", async (req, res) => {
  await connectDB();
  const data = req.body;

  if (
    !data.workName ||
    !data.workCategory ||
    !data.workDetails ||
    !data.submitterName ||
    !data.submitterEmail ||
    !data.workLink
  ) {
    return res.status(400).json({ message: "All fields required." });
  }

  try {
    const newWork = {
      ...data,
      submissionDate: new Date(),
      status: "pending",
    };

    const result = await UserWorkCollection.insertOne(newWork);

    res.status(201).json({
      message: "Work submitted successfully.",
      insertedId: result.insertedId,
      data: newWork,
    });
  } catch (error) {
    console.error("Error submitting work:", error);
    res.status(500).json({ message: "Failed to submit work." });
  }
});

// GET works
app.get("/api/works", async (req, res) => {
  await connectDB();
  try {
    const email = req.query.email;
    let filter = {};
    if (email) filter = { submitterEmail: email };

    const works = await UserWorkCollection.find(filter)
      .sort({ submissionDate: -1 })
      .toArray();
    res.status(200).json(works);
  } catch (error) {
    console.error("Error fetching works:", error);
    res.status(500).json({ message: "Failed to load works." });
  }
});

// DELETE work
app.delete("/api/works/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ID." });
  }

  try {
    const result = await UserWorkCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Work not found." });
    }

    res.status(200).json({ message: "Work deleted.", deletedId: id });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete work." });
  }
});

// JWT
app.post("/jwt", async (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

// verify token
const verifyToken = (req, res, next) => {
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
};

// verify admin
const verifyAdmin = async (req, res, next) => {
  await connectDB();
  const email = req.decoded.email;
  const user = await userCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

// USER ROUTES
app.get("/user", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  const result = await userCollection.find().toArray();
  res.send(result);
});

app.get("/user/admin/:email", verifyToken, async (req, res) => {
  await connectDB();
  const email = req.params.email;
  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }

  const user = await userCollection.findOne({ email });
  res.send({ admin: user?.role === "admin" });
});

app.post("/user", async (req, res) => {
  await connectDB();
  const user = req.body;
  const exists = await userCollection.findOne({ email: user.email });

  if (exists) {
    return res.send({ message: "user already exist", insertedId: null });
  }

  const result = await userCollection.insertOne(user);
  res.send(result);
});

app.patch("/user/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await userCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role: "admin" } }
  );
  res.send(result);
});

app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// MEMBERS
app.get("/members", async (req, res) => {
  await connectDB();
  const result = await memberCollection.find().toArray();
  res.send(result);
});

app.get("/members/count", async (req, res) => {
  await connectDB();
  const count = await memberCollection.countDocuments();
  res.json({ count });
});

app.post("/members", async (req, res) => {
  await connectDB();
  const result = await memberCollection.insertOne(req.body);
  res.send(result);
});

app.delete("/members/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await memberCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 1) res.send({ success: true });
  else res.status(404).send({ error: "Member not found" });
});

// PROJECTS
app.get("/projects", async (req, res) => {
  await connectDB();
  const result = await portfolioCollection.find().toArray();
  res.send(result);
});

app.post("/projects", async (req, res) => {
  await connectDB();
  const result = await portfolioCollection.insertOne(req.body);
  res.send(result);
});

app.delete("/projects/:id", async (req, res) => {
  await connectDB();
  const id = req.params.id;
  const result = await portfolioCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 1) res.send({ success: true });
  else res.status(404).send({ error: "project not found" });
});

// Export serverless app
module.exports = serverless(app);
