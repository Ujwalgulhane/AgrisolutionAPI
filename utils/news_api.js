const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const db = require('./db'); // Import the updated db connection file

async function scrap_data(req, res) {
    try {
        const data = await PythonShell.run(path.join(__dirname, '../python_news_scrapper/news_scraper.py'));
        console.log('Python Script Output:', data);

        const filePath = path.join(__dirname, '../assets/scrap_data.json');
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            let parsedData;
            try {
                parsedData = JSON.parse(fileContent);
                console.log('Parsed JSON Data:', parsedData);
            } catch (parseError) {
                console.error('JSON Parsing Error:', parseError);
                throw new Error('Invalid JSON format in scrap_data.json');
            }

            if (!Array.isArray(parsedData)) {
                parsedData = [parsedData];
                console.log('Converted parsed data to an array.');
            }

            await db.connect();
            const collectionName = req.params.collection_name;
            const collection = db.Connection.collection(collectionName);

            const collectionExists = await db.Connection.db.listCollections({ name: collectionName }).hasNext();
            if (!collectionExists) {
                await db.disconnect();
                return res.status(404).json({ stat: 0, msg: "Collection does not exist." });
            }

            const existingData = await collection.find().toArray();
            console.log('Existing Data:', existingData);

            const finalNews = parsedData.filter(news => !existingData.some(item => item.heading === news.heading));
            console.log('Final News to insert:', finalNews);

            if (finalNews.length > 0) {
                await collection.insertMany(finalNews.reverse());
                console.log('New news items inserted:', finalNews.length);
            } else {
                console.log('No new news items to insert.');
            }

            await db.disconnect();
            res.status(200).json({ stat: 1, msg: 'Data processed successfully.' });
        } else {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log('Created scrap_data.json successfully.');
            res.status(200).send({ stat: 1, msg: 'No existing data found. Created new file.' });
        }
    } catch (error) {
        console.error('Error during scraping:', error.message);
        await db.disconnect();
        res.status(500).json({ stat: 0, msg: 'Scraping failed', error: error.message });
    }
}


module.exports = { scrap_data };
