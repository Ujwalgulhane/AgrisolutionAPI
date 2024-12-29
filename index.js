const express = require('express')
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const cors = require("cors");
const db = require("./utils/db");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uniqid = require('uniqid');
const cloudinary = require('cloudinary').v2;
const {scrap_data}  = require('./utils/news_api');
const Notification = require('./models/notifications');
const http = require('http');
const io = require('socket.io')(http);
const app = express();
app.use(express.json());

// /--------------------------------------------------------------------------------------------\
//                                     Env Configuration
// \--------------------------------------------------------------------------------------------/

dotenv.config();

// /--------------------------------------------------------------------------------------------\
//                                     Port Configuration
// \--------------------------------------------------------------------------------------------/

const port = process.env.PORT || 8080;

// /--------------------------------------------------------------------------------------------\
//                                     Cors Configuration
// \--------------------------------------------------------------------------------------------/

const corsOptions = {
    origin: '*',
    credentials: true,            //access-control-allow-credentials:true
    optionSuccessStatus: 200,
}

app.use(cors(corsOptions)) // Use this after the variable declarationd

// /--------------------------------------------------------------------------------------------\
//                          Multer Configuration middleware to handle upload
// \--------------------------------------------------------------------------------------------/

const upload = multer();

// /--------------------------------------------------------------------------------------------\
//                                     Cloudinary Configuration
// \--------------------------------------------------------------------------------------------/

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
    secure: true
});

// /--------------------------------------------------------------------------------------------\
//                                     MongoDB Collections Operations
// \--------------------------------------------------------------------------------------------/


app.get('/get-collections', async (req, res) => {
    try {
        let collection_list = [];
        await db.connect(); // Connect to MongoDB

        // Fetch all collections in the database
        const collections = await db.Connection.db.listCollections().toArray();
        collections.forEach((collection) => {
            collection_list.push(collection.name);
        });

        await db.disconnect(); // Disconnect after fetching
        res.json(collection_list);
    } catch (error) {
       // console.error('Error fetching collections:', error.message);
        await db.disconnect();
        res.status(500).send("Internal Server Error");
    }
});

app.get('/create-collection/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        let collection_list = [];

        await db.connect(); // Connect to MongoDB

        // Check if the collection already exists
        const existingCollection = await db.Connection.db.listCollections({ name: collection_name }).next();
        if (existingCollection) {
            await db.disconnect(); // Disconnect if the collection already exists
            return res.status(200).json({ stat: 0, msg: "Collection already exists" });
        }

        // Create a new collection
        await db.Connection.db.createCollection(collection_name);
        //console.log(`Collection '${collection_name}' created successfully.`);

        // Fetch updated list of collections
        const collections = await db.Connection.db.listCollections().toArray();
        collections.forEach((collection) => {
            collection_list.push(collection.name);
        });

        await db.disconnect(); // Disconnect after operation
        res.json(collection_list);
    } catch (error) {
 //       console.error('Error creating collection:', error.message);
        await db.disconnect();
        res.status(500).send("Internal Server Error");
}
});


app.get('/drop-collection/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        let collection_list = [];

        // Connect to MongoDB
        await db.connect();

        // Check if the collection exists
        const collection = await db.Connection.db.listCollections({ name: collection_name }).next();
        if (collection) {
            // Drop the collection
            await db.Connection.db.dropCollection(collection_name);
           // console.log(`Collection '${collection_name}' dropped successfully.`);

            // Fetch updated list of collections
            const collections = await db.Connection.db.listCollections().toArray();
            collections.forEach((col) => {
                collection_list.push(col.name);
            });

            await db.disconnect(); // Disconnect after operation
            return res.status(200).json(collection_list );
        } else {
            await db.disconnect(); // Disconnect if the collection doesn't exist
            return res.status(200).json({ stat: 0, msg: `Collection '${collection_name}' does not exist.` });
        }
    } catch (error) {
      //console.error('Error dropping collection:', error.message);
        await db.disconnect();
        res.status(500).send("Internal Server Error");
    }
});


// /--------------------------------------------------------------------------------------------\
//                                     MongoDB Insertion Operations
// \--------------------------------------------------------------------------------------------/

app.post('/insert-one/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name; // Extract collection name from the URL
        const doc = req.body; // Extract the document to be inserted from the request body
        let collection_list = [];

        // Check if MongoDB is already connected
        if (!db.Connection.readyState || db.Connection.readyState === 0) {
            await db.connect();
        }

        // Check if the collection exists
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            // Insert the document into the collection
            const collection = db.Connection.collection(collection_name);
            const result = await collection.insertOne(doc);
            // console.log(`Document inserted into '${collection_name}':`, result);

            // Send success response
            return res.status(200).json({
                stat: 1,
                msg: "Document inserted successfully."
            });
        } else {
            return res.status(404).json({
                stat: 0,
                msg: `Collection '${collection_name}' does not exist.`
            });
        }
    } catch (error) {
        // console.error('Error inserting document:', error.message);

        // Send internal server error response
        res.status(500).send("Internal Server Error");
    } finally {
        // Ensure the connection is closed in all cases
        if (db.Connection.readyState === 1) {
            await db.disconnect();
        }
    }
});


app.post('/insert-many/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        const docs = req.body; // Assuming req.body contains an array of documents

        // Connect to the database
        await db.connect();

        // Check if the collection exists
        const collectionExists = await db.Connection.db
            .listCollections({ name: collection_name })
            .next();

        if (collectionExists) {
            // Get the collection and insert multiple documents
            const collection = db.Connection.collection(collection_name);
            const result = await collection.insertMany(docs);

            // Disconnect after the operation
            await db.disconnect();

            // Return success response
            res.status(200).json({
                stat: 1,
                msg: "Documents inserted successfully.",
                insertedCount: result.insertedCount,
            });
        } else {
            // Disconnect if the collection doesn't exist
            await db.disconnect();
            res.status(400).json({
                stat: 0,
                msg: `Collection '${collection_name}' does not exist.`,
            });
        }
    } catch (error) {
        // Ensure disconnection in case of an error
        await db.disconnect();
        res.status(500).json({
            stat: -1,
            msg: "Internal Server Error",
            error: error.message,
        });
    }
});


// /--------------------------------------------------------------------------------------------\
//                                     MongoDB Find Operations
// \--------------------------------------------------------------------------------------------/

// Fetch all documents in a collection
app.get('/find/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;

        await db.connect();
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const collectionData = await collection.find().toArray();

            await db.disconnect();
            res.status(200).json(collectionData);
        } else {
            await db.disconnect();
            res.status(400).json({ stat: 0, msg: `Collection '${collection_name}' does not exist.` });
        }
    } catch (error) {
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
});

// Fetch the latest documents in a collection
app.get('/find-latest/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;

        await db.connect();
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const collectionData = await collection.find().sort({ _id: -1 }).toArray();

            await db.disconnect();
            res.status(200).json(collectionData);
        } else {
            await db.disconnect();
            res.status(400).json({ stat: 0, msg: `Collection '${collection_name}' does not exist.` });
        }
    } catch (error) {
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
});

// Fetch a limited number of the latest documents in a collection
app.get('/find-latest/:collection_name/:limit', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        const limit = parseInt(req.params.limit, 10);

        await db.connect();
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const collectionData = await collection.find().sort({ _id: -1 }).limit(limit).toArray();

            await db.disconnect();
            res.status(200).json(collectionData);
        } else {
            await db.disconnect();
            res.status(400).json({ stat: 0, msg: `Collection '${collection_name}' does not exist.` });
        }
    } catch (error) {
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
});

// Fetch documents using an AND condition
app.post('/find-with-and/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        const query = req.body;

        await db.connect();
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const collectionData = await collection.find(query).toArray();

            await db.disconnect();
            res.status(200).json(collectionData);
        } else {
            await db.disconnect();
            res.status(400).json({ stat: 0, msg: `Collection '${collection_name}' does not exist.` });
        }
    } catch (error) {
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
});

// Fetch documents using an OR condition
app.post('/find-with-or/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        const queryArray = req.body;

        await db.connect();
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const collectionData = await collection.find({ $or: queryArray }).toArray();

            await db.disconnect();
            res.status(200).json(collectionData);
        } else {
            await db.disconnect();
            res.status(400).json({ stat: 0, msg: `Collection '${collection_name}' does not exist.` });
        }
    } catch (error) {
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
});



// /--------------------------------------------------------------------------------------------\
//                                     MongoDB Update Operations
// \--------------------------------------------------------------------------------------------/

// Endpoint to update one document in a collection
app.post('/update/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        const { filter, update } = req.body;

        if (!filter || !update) {
            return res.status(400).json({ stat: 0, msg: "Invalid request body. 'filter' and 'update' are required." });
        }

        await db.connect();
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const result = await collection.updateOne(filter, { $set: update });

            await db.disconnect();

            if (result.modifiedCount > 0) {
                res.status(200).json({ stat: 1, msg: "Update successful." });
            } else {
                res.status(200).json({ stat: 0, msg: "No documents were updated." });
            }
        } else {
            await db.disconnect();
            res.status(404).json({ stat: 0, msg: "Collection does not exist." });
        }
    } catch (error) {
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
});

// Endpoint to update multiple documents in a collection
app.post('/update-many/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        const { filter, update } = req.body;

        if (!filter || !update) {
            return res.status(400).json({ stat: 0, msg: "Invalid request body. 'filter' and 'update' are required." });
        }

        await db.connect();
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const result = await collection.updateMany(filter, { $set: update });

            await db.disconnect();

            if (result.modifiedCount > 0) {
                res.status(200).json({ stat: 1, msg: "Update successful." });
            } else {
                res.status(200).json({ stat: 0, msg: "No documents were updated." });
            }
        } else {
            await db.disconnect();
            res.status(404).json({ stat: 0, msg: "Collection does not exist." });
        }
    } catch (error) {
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
});


// /--------------------------------------------------------------------------------------------\
//                                     MongoDB Delete Operations
// \--------------------------------------------------------------------------------------------/

app.post('/delete/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name; // Extract collection name from the URL
        const doc = req.body; // Extract the document to be deleted from the request body

        // Check if MongoDB is already connected
        if (!db.Connection.readyState || db.Connection.readyState === 0) {
            await db.connect();
        }

        // Check if the collection exists
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const result = await collection.deleteOne(doc['filter']);
            if (result.deletedCount > 0) {
                return res.status(200).json({
                    stat: 1,
                    msg: "Document deleted successfully."
                });
            } else {
                return res.status(404).json({
                    stat: 0,
                    msg: "No matching document found to delete."
                });
            }
        } else {
            return res.status(404).json({
                stat: 0,
                msg: `Collection '${collection_name}' does not exist.`
            });
        }
    } catch (error) {
        // Send internal server error response
        console.error('Error deleting document:', error.message);
        res.status(500).send("Internal Server Error");
    } finally {
        // Ensure the connection is closed in all cases
        if (db.Connection.readyState === 1) {
            await db.disconnect();
        }
    }
});

app.post('/delete-many/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name; // Extract collection name from the URL
        const doc = req.body; // Extract the document with the filter from the request body

        // Check if MongoDB is already connected
        if (!db.Connection.readyState || db.Connection.readyState === 0) {
            await db.connect();
        }

        // Check if the collection exists
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).next();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const result = await collection.deleteMany(doc['filter']); 
            if (result.deletedCount > 0) {
                return res.status(200).json({
                    stat: 1,
                    msg: "Documents deleted successfully."
                });
            } else {
                return res.status(404).json({
                    stat: 0,
                    msg: "No matching documents found to delete."
                });
            }
        } else {
            return res.status(404).json({
                stat: 0,
                msg: `Collection '${collection_name}' does not exist.`
            });
        }
    } catch (error) {
        // Send internal server error response
        console.error('Error deleting documents:', error.message);
        res.status(500).send("Internal Server Error");
    } finally {
        // Ensure the connection is closed in all cases
        if (db.Connection.readyState === 1) {
            await db.disconnect();
        }
    }
});


// /--------------------------------------------------------------------------------------------\
//                                     MongoDB Insertion with single image
// \--------------------------------------------------------------------------------------------/

async function buffer_to_image(buffer, outputPath, req, res) {
    try {
        const collection_name = req.params.collection_name;
        const doc = req.body;

        // Write the buffer to the output path
        await new Promise((resolve, reject) => {
            fs.writeFile(outputPath, buffer, (err) => {
                if (err) reject(new Error('Error writing image: ' + err));
                else resolve();
            });
        });

        // Upload the image to Cloudinary
        const result = await cloudinary.uploader.upload(outputPath);

        // Add image URL to the document
        doc['img_url'] = result.secure_url;

        // Remove the local file after upload
        fs.unlinkSync(outputPath);

        // Connect to the database
        await db.connect();

        // Check if the collection exists
        const collectionExists = await db.Connection.db.listCollections({ name: collection_name }).hasNext();

        if (collectionExists) {
            const collection = db.Connection.collection(collection_name);
            const insertResult = await collection.insertOne(doc);

            // Disconnect from the database
            await db.disconnect();

            // Respond with the success message
            res.status(200).json({
                stat: 1,
                msg: "Data inserted with image",
                secure_url: result.secure_url,
                url: result.url,
                original_filename: result.original_filename,
                width: result.width,
                height: result.height,
                format: result.format,
                resource_type: result.resource_type,
                bytes: result.bytes
            });
        } else {
            // Disconnect from the database if the collection does not exist
            await db.disconnect();
            res.status(404).json({ stat: 0, msg: "Collection does not exist." });
        }
    } catch (error) {
        // Disconnect from the database in case of any error
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: "Internal Server Error", error: error.message });
    }
}

app.post('/insert-image/:collection_name', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ stat: 0, msg: 'No file uploaded' });
        }

        console.log("File uploaded successfully:", req.file);

        const fileExtension = req.file.mimetype.split('/')[1];
        const outputPath = path.join(__dirname, `./assets/${uniqid()}.${fileExtension}`);

        // Call the buffer_to_image function to handle the image processing
        await buffer_to_image(req.file.buffer, outputPath, req, res);
        console.log("Image processing completed");

    } catch (error) {
        console.error("Error occurred:", error);
        await db.disconnect();
        res.status(500).json({ stat: -1, msg: 'Internal Server Error', error: error.message });
    }
});



// /--------------------------------------------------------------------------------------------\
//                                 News_API
// \--------------------------------------------------------------------------------------------/

app.get('/scrap-news/:collection_name', (req, res) => {
    // Pass collection_name from the URL to scrap_data function
    scrap_data(req, res);
console.log("All Scrap Data ");
});

// /--------------------------------------------------------------------------------------------\
//                                  Realtime chatting API
// \--------------------------------------------------------------------------------------------/

const clients = new Map();
app.get('/chat-updates/:collection_name', async (req, res) => {
    const clientId = uuidv4();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.set(clientId, res);

    req.on('close', () => {
        clients.delete(clientId);
    });

    try {
        const collection_name = req.params.collection_name;
        await db.connect(); // db.connect() instead of db.db.connect()
        let collection = await db.Connection.db.listCollections({ name: collection_name }).next();
        if (collection) {
            const collectionData = await db.Connection.collection(collection_name).find().toArray();
            await db.disconnect(); // db.disconnect() instead of db.db.disconnect()

            collectionData.forEach((message) => {
                res.write(`data: ${JSON.stringify(message)}\n\n`); // Sending data to the client
            });
        } else {
            await db.disconnect();
            res.json({ stat: 0, msg: "Collection does not exist." });
        }

    } catch (error) {
        console.error('Error fetching chat messages:', error);
        res.status(500).send("Internal Server Error");
    }
});

app.post('/send-message/:collection_name', async (req, res) => {
    try {
        const collection_name = req.params.collection_name;
        const doc = req.body;

        await db.connect(); // db.connect() instead of db.db.connect()
        let collection = await db.Connection.db.listCollections({ name: collection_name }).next();
        if (collection) {
            const collection = db.Connection.collection(collection_name);
            await collection.insertOne(doc);
            const collectionData = await collection.find().toArray();
            await db.disconnect(); // db.disconnect() instead of db.db.disconnect()

            // Broadcast the new message to all connected clients
            for (const [clientId, clientResponse] of clients) {
                clientResponse.write(`data: ${JSON.stringify(doc)}\n\n`);
            }

            res.sendStatus(200);
        } else {
            await db.disconnect();
            res.json({ stat: 0, msg: "Collection does not exist." });
        }

    } catch (error) {
        console.error('Error saving chat message:', error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/close-connections', (req, res) => {
    try {
        // Close all client connections
        for (const [clientId, clientResponse] of clients) {
            clientResponse.end();
            clients.delete(clientId);
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('Error closing connections:', error);
        res.sendStatus(500);
    }
});


// /--------------------------------------------------------------------------------------------\
//                              Message Notification Using Model
// \--------------------------------------------------------------------------------------------/

app.post('/store-message/:userid', async (req, res) => {
    try {
        const userid = req.params.userid;
        const doc = req.body;
        await db.db.connect();
        const is_exist = await Notification.notification.findOne({ 'userId': userid });
        // console.log(is_exist);
        if (!is_exist) {
            const notification = new Notification.notification({
                userId: userid,
                all_notifications: [doc]
            });
            const saved_notification = await notification.save();
        }else{
            await is_exist.all_notifications.push(doc);
            await is_exist.save();
        } 
        await db.db.disconnect();
        res.sendStatus(200);
    } catch (error) {
        res.status(500).send("Internal Server Error");
    }
})

app.get('/get-notification/:userid/:field_name', async (req, res) => {
    try {
        const userid = req.params.userid;
        const field_name = req.params.field_name;
        await db.db.connect();
        const is_exist = await Notification.notification.findOne({ 'userId': userid });
        // console.log(is_exist);
        if (!is_exist) {
            await db.db.disconnect();
            res.json({stat:0, msg:"user id not exists"});
        }else{
            if(is_exist[field_name]){
                await db.db.disconnect();
                res.json({data : is_exist[field_name]})
            }else{
                await db.db.disconnect();
                res.json({stat:0, "msg":'field name not exists'})
}
        }
    } catch (error) {
        res.status(500).send("Internal Server Error");
    }
})

app.get('/', async (req, res) => {
    res.status(200).send({ msg: "Connected to SIH Project!!" });
})
app.listen(port, () => {
    console.log(`Listening on port ${port}`)
})
