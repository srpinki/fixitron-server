require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();

const admin = require("firebase-admin");

const serviceAccount = require("./fixitron-firebase-adminsdk.json");

// const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
// const serviceAccount = JSON.parse(decoded);

const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.sanctt6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("decoded token", decoded);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const serviceCollection = client.db("fixitronDB").collection("services");
    const bookingCollection = client.db("fixitronDB").collection("booking");
    const contactCollection = client.db("fixitronDB").collection("contacts");

    //send service data
    app.post("/services", async (req, res) => {
      const newServices = req.body;
      const result = await serviceCollection.insertOne(newServices);
      res.send(result);
    });

    //send booking data
    app.post("/booking_details", async (req, res) => {
      const newBooking = req.body;
      const result = await bookingCollection.insertOne(newBooking);
      res.send(result);
    });

    // send contact message
    app.post("/contact", async (req, res) => {
      try {
        const contactData = req.body; 
        contactData.createdAt = new Date(); 
        const result = await contactCollection.insertOne(contactData);
        res.status(201).send({ success: true, id: result.insertedId });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    //get booking data
    app.get("/booking_details", verifyFirebaseToken, async (req, res) => {
      const userEmail = req.decoded.email;
      const email = req.query.email;
      if (email !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      // const query = {
      //   user_email: email,
      // };
      const result = await bookingCollection.find().toArray();
      res.send(result);
    });

    //update booking status
    app.put("/booking_details/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsrt: true };
      const updatedStatus = req.body;
      const updatedDoc = {
        $set: updatedStatus,
      };

      const result = await bookingCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    //get service data
    app.get("/services", async (req, res) => {
      const { serachParams } = req.query;
      let query = {};
      if (serachParams) {
        query = { service_name: { $regex: serachParams, $options: "i" } };
      }
      const result = await serviceCollection.find(query).toArray();
      res.send(result);
    });

    //get service data for private route
    app.get("/my-services", verifyFirebaseToken, async (req, res) => {
      const userEmail = req.decoded.email;
      const email = req.query.email;
      if (email !== userEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = {
        providerEmail: email,
      };
      const result = await serviceCollection.find(query).toArray();
      res.send(result);
    });

    //update service data
    app.put("/services/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const userEmail = req.decoded.email;
      const filter = { _id: new ObjectId(id), providerEmail: userEmail };
      const options = { upsert: true };
      const updatedService = req.body;
      const updatedDoc = {
        $set: updatedService,
      };

      const result = await serviceCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    //delete service data
    app.delete("/services/:id", verifyFirebaseToken, async (req, res) => {
      const userEmail = req.decoded.email;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const service = await serviceCollection.findOne(query);

      if (!service) {
        return res.status(404).send({ message: "Service not found" });
      }

      if (service.providerEmail !== userEmail) {
        return res
          .status(403)
          .send({ message: "Forbidden: You do not own this service" });
      }

      const result = await serviceCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
