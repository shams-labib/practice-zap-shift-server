require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const port = 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(express.json());
app.use(cors());

const admin = require("firebase-admin");

const serviceAccount = require("./zap-shift-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFBToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: "Unauthorize access" });
  }

  const token = authorization.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = decoded.email;
    req.decoded_email = email;
  } catch {
    return res.status(401).send({ message: "Unauthorize access" });
  }
  next();
};

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
    const paymentCollection = db.collection("payment");
    const userCollection = db.collection("user");

    // users collection
    app.post("/users", async (req, res) => {
      const user = req.body;
      user.createdAt = new Date();
      user.role = "user";

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

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

      const result = await parcelCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
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
                name: `Please pay for ${paymentInfo.parcelName}`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: {
          parcelId: paymentInfo.parcelId,
          parcelName: paymentInfo.parcelName,
        },
        customer_email: paymentInfo.senderEmail,
        success_url: `${process.env.DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.DOMAIN}/dashboard/payment-cancel`,
      });

      res.send({ url: session.url });
    });

    // Update mal

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // console.log(session);

      const transactionId = session.payment_intent;

      const query = { transactionId: transactionId };
      const paymentExit = await paymentCollection.findOne(query);
      if (paymentExit) {
        return res.send({
          message: "Already Use",
          transactionId,
          trackingId: paymentExit.trackingId,
        });
      }

      const trackingId = genarateTrackingId();

      if (session.payment_status === "paid") {
        const id = session.metadata.parcelId;

        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "paid",
            trackingId: trackingId,
          },
        };
        const result = await parcelCollection.updateOne(query, update);

        // Part 4 chapter close

        const payment = {
          amount: session.amount_total / 100,
          currency: session.currency,
          customerEmail: session.customer_email,
          parcelId: session.metadata.parcelId,
          parcelName: session.metadata.parcelName,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentCollection.insertOne(payment);
          return res.send({
            success: true,
            modifyParcel: result,
            paymentInfo: resultPayment,
            trackingId: trackingId,
            transactionId: session.payment_intent,
          });
        }

        // res.send({ success: true });

        // res.send({ success: true, trackingId, transactionId });
      }

      return res.send({ success: false });
    });

    app.get("/payment", verifyFBToken, async (req, res) => {
      const email = req.query.email;

      const query = {};
      if (email) {
        query.customerEmail = email;
      }
      if (email !== req.decoded_email) {
        return res.status(401).send({ message: "Unauthorize access" });
      }
      const cursor = await paymentCollection
        .find(query)
        .sort({ paidAt: -1 })
        .toArray();
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
  console.log(`This is ${port}`);
});
