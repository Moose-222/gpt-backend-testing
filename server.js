const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Define the path for the temporary Google Vision key file
const keyFilePath = path.join('/tmp', 'google-test-2.json');

// Create a temporary keyfile with the Google Vision JSON credentials
if (process.env.VISION_API_KEY_JSON) {
    try {
        // Write the credentials to the /tmp directory on Vercel
        fs.writeFileSync(keyFilePath, process.env.VISION_API_KEY_JSON);
        console.log('Google Vision API keyfile written successfully');
        process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath; // Set the credentials environment variable
    } catch (err) {
        console.error('Error writing Google Vision API keyfile:', err);
        process.exit(1); // Exit if we can't write the keyfile
    }
} else {
    console.error('Google Vision API credentials (JSON) are missing');
    process.exit(1);  // Exit if we don't have the credentials
}

// Set the Vision API URL using the API key
let visionApiUrl = '';
if (process.env.VISION_API_KEY) {
    visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${process.env.VISION_API_KEY}`;
    console.log('Vision API URL set:', visionApiUrl);
} else {
    console.error('Google Vision API Key is missing');
    process.exit(1);  // Exit if we don't have the API key
}

// Use CORS middleware
app.use(cors());
app.use(express.json());

// Configure Multer to use /tmp for file uploads on Vercel
const upload = multer({
    dest: '/tmp',
    limits: { fileSize: 10 * 1024 * 1024 }, // Set file size limit (10MB in this case)
});

// Handle file upload and message in the request
app.post('/api/chatgpt', (req, res, next) => {
    upload.single('file')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer Error:', err.message);
            return res.status(400).json({ error: err.message });
        } else if (err) {
            console.error('File upload error:', err.message);
            return res.status(500).json({ error: 'File upload error', details: err.message });
        }
        next();
    });
}, async (req, res) => {
    console.log('Received request body:', req.body);
    console.log('Received file:', req.file ? req.file.originalname : 'No file uploaded');

    const userMessage = req.body.message;
    const file = req.file;

    if (!userMessage && !file) {
        console.log('Error: No message or file provided.');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        console.log('File received:', file);

        try {
            const imageBuffer = fs.readFileSync(file.path); // Read the image file
            const imageBase64 = imageBuffer.toString('base64'); // Convert it to base64

            // Make the request to Google Vision API using REST
            const visionResponse = await axios.post(visionApiUrl, {
                requests: [
                    {
                        image: {
                            content: imageBase64,
                        },
                        features: [
                            {
                                type: 'TEXT_DETECTION', // You can change this to other features like LABEL_DETECTION, etc.
                            },
                        ],
                    },
                ],
            });

            const detections = visionResponse.data.responses[0].textAnnotations;
            fileContent = detections.length ? detections[0].description : 'No text detected';
            console.log('Extracted text from image:', fileContent);
        } catch (visionError) {
            console.error('Error processing Vision API:', visionError);
            return res.status(500).json({ error: 'Error processing Vision API', details: visionError.message });
        }
    }

    try {
        const messages = [{ role: "user", content: userMessage || ' ' }];

        if (fileContent) {
            messages.push({ role: "user", content: `Here is the extracted text from the image: ${fileContent}` });
        }

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: messages,
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const reply = response.data.choices[0]?.message?.content;
        if (!reply) {
            console.error('No valid response received from OpenAI');
            return res.status(500).json({ error: 'No valid response received from OpenAI' });
        }

        console.log('OpenAI reply:', reply);
        res.json({ reply });
    } catch (error) {
        console.error('Error during OpenAI request:', error);
        res.status(500).json({ error: 'Something went wrong with the OpenAI request', details: error.message });
    } finally {
        if (file) {
            try {
                fs.unlinkSync(file.path);  // Delete the file after processing
                console.log('File deleted after processing');
            } catch (unlinkError) {
                console.error('Error deleting the file:', unlinkError);
            }
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
