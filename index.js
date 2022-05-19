const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express')
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000;

app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.yyeil.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyToken(req, res, next) {
  const authorization = req?.headers?.authorization;
  // console.log(authorization);
  if (!authorization) {
    return res.status(401).send({ message: 'unAuthorized' })
  }

  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      res.status(403).send({ message: 'Forbidden access' })
    }
    req.decoded = decoded;
    next();
  });
}


async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctors_portal").collection("services");
    const bookingCollection = client.db("doctors_portal").collection("booking");
    const userCollection = client.db("doctors_portal").collection("users");
    const doctorCollection = client.db("doctors_portal").collection("doctors");

    const verifyAdmin = async(req,res,next) => {
      const requester = req.decoded.email;
      const requesterAdmin = await userCollection.findOne({ email: requester });
      if (requesterAdmin.role === 'admin') {
        next();
      }
      else{
        return res.status(403).send({message:'Forbidden'})
      }
    }

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({name : 1});
      const services = await cursor.toArray();
      res.send(services);
    })

    app.get('/available', async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();

      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();

      services.forEach(service => {
        const serviceBooking = bookings.filter(b => b.treatment === service.name);
        const booked = serviceBooking.map(s => s.slot);
        const available = service.slots.filter(s => !booked.includes(s));
        service.slots = available;
      })

      res.send(services);
    });

    app.get('/user', verifyToken, async (req, res) => {
      const user = await userCollection.find().toArray();
      res.send(user)
    });

    app.get('/admin/:email', async(req,res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({email: email})
      const isAdmin = user.role === 'admin'
      res.send({admin: isAdmin});
    })

    app.put('/user/admin/:email', verifyToken,verifyAdmin, async (req, res) => {
      const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' }
        };

        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    )

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      };

      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
      res.send({ result, token });
    })

    app.get('/booking', verifyToken, async (req, res) => {
      const patient = req.query.patientName;
      const decodedEmail = req?.decoded?.email;
      if (patient === decodedEmail) {
        const query = { patientEmail: patient };
        const allBooking = await bookingCollection.find(query).toArray();
        res.send(allBooking);
      }
      else {
        res.status(403).send({ message: 'Forbidden access' })
      }
    })

    app.post('/booking', async (req, res) => {
      const data = req.body;
      const query = { treatment: data.treatment, date: data.date, patientEmail: data.patientEmail };
      const exist = await bookingCollection.findOne(query);
      if (exist) {
        return res.send({ success: false, booking: data })
      }
      const booking = await bookingCollection.insertOne(data);
      return res.send({ success: true, booking });
    })

    app.get('/doctor',verifyToken,verifyAdmin, async(req,res) => {
      const doctor = await doctorCollection.find().toArray();
      res.send(doctor)
    })

    app.post('/doctor', verifyToken,verifyAdmin, async(req,res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    })
  }
  finally {}
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello doctor!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})