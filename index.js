require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(express.json());
app.use(cors());
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gs1mqwb.mongodb.net/?appName=Cluster0`;
const crypto = require("crypto");
function genarateTrackingId() {
  const prefix = "";
  const date = new Date().toISOString().slice(0, 10).replace(/-g/);
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${date}-${random}`;
}

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
      const query = {};
      const { email } = req.query;
      if (email) {
        query.senderEmail = email;
      }

      const result = await parcelCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/parcels2/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.findOne(query);
      res.send(result);
    });

    app.delete("/parcels2/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    });

    // payment Info

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.cost) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (e.g. price_1234) of the product you want to sell
            price_data: {
              currency: "usd",
              unit_amount: amount,
              product_data: {
                name: `Please pay for ${paymentInfo.name}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.id,
        },
        customer_email: paymentInfo.email,
        success_url: `${process.env.DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.DOMAIN}/dashboard/payment-cancel`,
      });

      res.send({ url: session.url });
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
  console.log(`This is ${port}`);
});
