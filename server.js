const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const vision = require('@google-cloud/vision');  // Google Cloud Vision
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Create a temporary keyfile with the Google Vision JSON credentials
if (process.env.GOOGLE_CREDENTIALS_JSON) {
    // Ensure the path and write the content to the correct file
    const keyFilePath = '/tmp/vision-api-keyfile.json';
    try {
        fs.writeFileSync(keyFilePath, process.env.GOOGLE_CREDENTIALS_JSON);
        console.log('Google Vision API keyfile written successfully');
    } catch (err) {
        console.error('Error writing Google Vision API keyfile:', err);
        process.exit(1);  // Exit if we can't write the keyfile
    }
    // Set the GOOGLE_APPLICATION_CREDENTIALS environment variable to point to the keyfile
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFilePath;
} else {
    console.error('Google Vision API credentials are missing');
    process.exit(1);  // Exit if we don't have the credentials
}

// Use CORS middleware
app.use(cors());
app.use(express.json());

// Configure Multer to use /tmp for file uploads on Vercel
const upload = multer({
    dest: '/tmp',
    limits: { fileSize: 10 * 1024 * 1024 }, // Set file size limit (10MB in this case)
});

// Endpoint for handling file upload and message
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

    // Check if both message and file are missing
    if (!userMessage && !file) {
        console.log('Error: No message or file provided.');
        return res.status(400).json({ error: 'Message or file is required' });
    }

    let fileContent = '';
    if (file) {
        console.log('File received:', file);

        try {
            // Initialize the Vision API client
            const client = new vision.ImageAnnotatorClient();
            const [result] = await client.textDetection(file.path);
            const detections = result.textAnnotations;
            fileContent = detections.length ? detections[0].description : 'No text detected';
            console.log('Extracted text from image:', fileContent);
        } catch (visionError) {
            console.error('Error processing Vision API:', visionError);
            return res.status(500).json({ error: 'Error processing Vision API', details: visionError.message });
        }
    }

    try {
        // Prepare messages array for OpenAI API
        const messages = [{ role: "user", content: userMessage || ' ' }]; // Handle empty message scenario

        if (fileContent) {
            messages.push({ role: "user", content: `Here is the extracted text from the image: ${fileContent}` });
        }

        // Call OpenAI API
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
                fs.unlinkSync(file.path);  // Delete the file from /tmp directory after processing
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
