const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

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
                                type: 'TEXT_DETECTION', // Specify what feature you want
                            },
                        ],
                    },
                ],
            });

            if (visionResponse.status !== 200) {
                console.error(`Vision API error: ${visionResponse.statusText}`);
                return res.status(500).json({ error: 'Vision API error', details: visionResponse.statusText });
            }

            const detections = visionResponse.data.responses[0]?.textAnnotations;
            fileContent = detections?.length ? detections[0].description : 'No text detected';
            console.log('Extracted text from image:', fileContent);
        } catch (visionError) {
            console.error('Error processing Vision API:', visionError.response?.data || visionError.message);
            return res.status(500).json({ error: 'Error processing Vision API', details: visionError.response?.data || visionError.message });
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
    
        const botReply = response.data.choices[0]?.message?.content;
    
        if (!botReply) {
            console.error('No valid response received from OpenAI');
            return res.status(500).json({ error: 'No valid response received from OpenAI' });
        }
    
        // Add the logic for image analysis steps
        const imageAnalysisStep1 = "Step 1: Highlighting main parts of the image.";
        const imageAnalysisStep2 = "Step 2: Summary of the image.";
        const imageAnalysisStep3 = "Step 3: Insights learned for future use from the image.";
    
        // Combine bot reply with the image analysis steps
        const formattedReply = `${botReply}###${imageAnalysisStep1}###${imageAnalysisStep2}###${imageAnalysisStep3}`;
        
        // Send the formatted reply with image analysis to the frontend
        res.json({ 
            reply: formattedReply,
            imageAnalysis: {
                step1: imageAnalysisStep1,
                step2: imageAnalysisStep2,
                step3: imageAnalysisStep3
            }
        });
    
        console.log('OpenAI reply:', formattedReply);
    } catch (error) {
        console.error('Error during OpenAI request:', error);
        return res.status(500).json({ error: 'Something went wrong with the OpenAI request', details: error.message });
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
