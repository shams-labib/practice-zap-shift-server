require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;
const { MongoClient, ServerApiVersion } = require("mongodb");

app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gs1mqwb.mongodb.net/?appName=Cluster0`;

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

    const db = client.db("Practice-zap-shift");
    const parcelCollection = db.collection("parcels2");

    app.post("/parcels2", async (req, res) => {
      const parcel = req.body;

      const newParcel = {
        ...parcel,
        createdAt: new Date(),
      };

      const result = await parcelCollection.insertOne(newParcel);
      res.send(result);
    });

    app.get("/parcels2", async (req, res) => {
      const cursor = await parcelCollection.find().toArray();
      res.send(cursor);
    });

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

app.get("/", async (req, res) => {
  res.send("This is mal");
});

app.listen(port, () => {
  `This is ${port}`;
});
