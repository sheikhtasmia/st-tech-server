const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors());
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

let userCollection, memberCollection, portfolioCollection, UserWorkCollection;

// Connect DB once (for Vercel Serverless)
async function connectDB() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
    const db = client.db("stTechDb");

    userCollection = db.collection("user");
    memberCollection = db.collection("members");
    portfolioCollection = db.collection("projects");
    UserWorkCollection = db.collection("Works");

    console.log("MongoDB Connected (Vercel Serverless)");
  }
}
connectDB();

// JWT Middleware
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

// Admin Check
const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const user = await userCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).send({ message: "forbidden access" });
  }

  next();
};

// Root Route
app.get("/", (req, res) => {
  res.send("ST Tech Backend is Running on Vercel (Serverless)!");
});

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
      message: "কাজ জমা দিতে সব ইনপুট দিতে হবে।",
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
      message: "কাজ সফলভাবে জমা হয়েছে।",
      insertedId: result.insertedId,
      data: newWork,
    });
  } catch (error) {
    console.error("Work submit error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/works", async (req, res) => {
  try {
    const email = req.query.email;
    const filter = email ? { submitterEmail: email } : {};

    const works = await UserWorkCollection.find(filter)
      .sort({ submissionDate: -1 })
      .toArray();

    res.send(works);
  } catch (error) {
    res.status(500).json({ message: "Failed to load works" });
  }
});

app.delete("/api/works/:id", async (req, res) => {
  const id = req.params.id;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid Work ID" });
  }

  const result = await UserWorkCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: "Work not found" });
  }

  res.send({ message: "Work deleted", deletedId: id });
});

app.post("/jwt", async (req, res) => {
  const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
  res.send({ token });
});

app.get("/user", verifyToken, verifyAdmin, async (req, res) => {
  const result = await userCollection.find().toArray();
  res.send(result);
});

app.get("/user/admin/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  if (email !== req.decoded.email) {
    return res.status(403).send({ message: "Forbidden" });
  }

  const user = await userCollection.findOne({ email });
  res.send({ admin: user?.role === "admin" });
});

app.post("/user", async (req, res) => {
  const user = req.body;
  const exists = await userCollection.findOne({ email: user.email });

  if (exists) return res.send({ message: "User already exists" });

  const result = await userCollection.insertOne(user);
  res.send(result);
});

app.patch("/user/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
  const result = await userCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { role: "admin" } }
  );
  res.send(result);
});

app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
  const result = await userCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send(result);
});

app.get("/members", async (req, res) => {
  const members = await memberCollection.find().toArray();
  res.send(members);
});

app.get("/members/count", async (req, res) => {
  const count = await memberCollection.countDocuments();
  res.json({ count });
});

app.post("/members", async (req, res) => {
  const result = await memberCollection.insertOne(req.body);
  res.send(result);
});

app.delete("/members/:id", async (req, res) => {
  const result = await memberCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send({ success: result.deletedCount === 1 });
});

/* ---------------- PROJECTS APIs ---------------- */
app.get("/projects", async (req, res) => {
  const result = await portfolioCollection.find().toArray();
  res.send(result);
});

app.post("/projects", async (req, res) => {
  const result = await portfolioCollection.insertOne(req.body);
  res.send(result);
});

app.delete("/projects/:id", async (req, res) => {
  const result = await portfolioCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });
  res.send({ success: result.deletedCount === 1 });
});

module.exports = (req, res) => app(req, res);
