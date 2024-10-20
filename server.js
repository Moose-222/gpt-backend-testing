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
    fs.writeFileSync('/tmp/vision-api-keyfile.json', process.env.GOOGLE_CREDENTIALS_JSON);
}

// Set the path to the keyfile
process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/vision-api-keyfile.json';

// Use CORS middleware
app.use(cors());
app.use(express.json());

// Configure Multer to use /tmp for file uploads on Vercel
const upload = multer({
    dest: '/tmp',
    limits: { fileSize: 10 * 1024 * 1024 }, // Set file size limit (10MB in this case)
});

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
            const client = new vision.ImageAnnotatorClient();
            const [result] = await client.textDetection(file.path);
            const detections = result.textAnnotations;
            fileContent = detections.length ? detections[0].description : '';
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
