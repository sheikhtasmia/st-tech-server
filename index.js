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

// ====================== Helper Function ======================
async function getCollections() {
  if (!client.topology || !client.topology.isConnected()) {
    await client.connect();
  }
  const db = client.db("stTechDb");
  return {
    userCollection: db.collection("user"),
    memberCollection: db.collection("members"),
    portfolioCollection: db.collection("projects"),
    UserWorkCollection: db.collection("Works"),
  };
}

// ====================== JWT Middleware ======================
const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: "unauthorized access" });
    req.decoded = decoded;
    next();
  });
};

// Admin Middleware
const verifyAdmin = async (req, res, next) => {
  try {
    const { userCollection } = await getCollections();
    const email = req.decoded.email;
    const user = await userCollection.findOne({ email });
    if (user?.role !== "admin") {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  } catch (err) {
    console.error("verifyAdmin error:", err);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

// ====================== Routes ======================

// Root
app.get("/", (req, res) => {
  res.send("ST Tech Backend is Running on Vercel (Serverless)!");
});

// ----------- Works -----------
app.post("/api/works", async (req, res) => {
  try {
    const data = req.body;
    if (
      !data.workName ||
      !data.workCategory ||
      !data.workDetails ||
      !data.submitterName ||
      !data.submitterEmail ||
      !data.workLink
    ) {
      return res
        .status(400)
        .json({ message: "কাজ জমা দিতে সব ইনপুট দিতে হবে।" });
    }

    const { UserWorkCollection } = await getCollections();

    const newWork = { ...data, submissionDate: new Date(), status: "pending" };
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

app.get("/api/works", async (req, res) => {
  try {
    const email = req.query.email;
    const filter = email ? { submitterEmail: email } : {};

    const { UserWorkCollection } = await getCollections();
    const works = await UserWorkCollection.find(filter)
      .sort({ submissionDate: -1 })
      .toArray();

    res.json(works);
  } catch (err) {
    console.error("/api/works GET error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/api/works/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid Work ID" });

    const { UserWorkCollection } = await getCollections();
    const result = await UserWorkCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Work not found" });

    res.json({ message: "Work deleted", deletedId: id });
  } catch (err) {
    console.error("/api/works DELETE error:", err);
    res.status(500).json({ message: "Internal Server Error" });
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

app.post("/members", async (req, res) => {
  try {
    const { memberCollection } = await getCollections();
    const result = await memberCollection.insertOne(req.body);
    res.json(result);
  } catch (err) {
    console.error("/members POST error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/members/:id", async (req, res) => {
  try {
    const { memberCollection } = await getCollections();
    const result = await memberCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.json({ success: result.deletedCount === 1 });
  } catch (err) {
    console.error("/members/:id DELETE error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ----------- Projects -----------
app.get("/projects", async (req, res) => {
  try {
    const { portfolioCollection } = await getCollections();
    const result = await portfolioCollection.find().toArray();
    res.json(result);
  } catch (err) {
    console.error("/projects GET error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/projects", async (req, res) => {
  try {
    const { portfolioCollection } = await getCollections();
    const result = await portfolioCollection.insertOne(req.body);
    res.json(result);
  } catch (err) {
    console.error("/projects POST error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/projects/:id", async (req, res) => {
  try {
    const { portfolioCollection } = await getCollections();
    const result = await portfolioCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.json({ success: result.deletedCount === 1 });
  } catch (err) {
    console.error("/projects/:id DELETE error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ====================== Export for Vercel ======================
module.exports = (req, res) => app(req, res);
