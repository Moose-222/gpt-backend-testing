const express = require('express');
const axios = require('axios');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
    limits: { fileSize: 10 * 1024 * 1024 },
});

// Route to get a specific template based on document type
app.get('/api/template/:type', async (req, res) => {
    const templateType = req.params.type;
    const templatePath = path.join(__dirname, 'templates', `${templateType}.json`);

    try {
        const templateData = await fs.promises.readFile(templatePath, 'utf-8');
        res.json(JSON.parse(templateData));
    } catch (error) {
        console.error(`Error retrieving template: ${error.message}`);
        res.status(404).json({ error: 'Template not found or could not be read.' });
    }
});

// Route to save modified template data
app.post('/api/save_template/:type', async (req, res) => {
    const templateType = req.params.type;
    const modifiedData = req.body;

    const savePath = path.join(__dirname, 'modified_templates', `${templateType}_modified.json`);

    try {
        await fs.promises.mkdir(path.join(__dirname, 'modified_templates'), { recursive: true });
        await fs.promises.writeFile(savePath, JSON.stringify(modifiedData, null, 2), 'utf-8');
        console.log(`Modified template data saved successfully at ${savePath}`);
        res.json({ message: 'Template data saved successfully' });
    } catch (err) {
        console.error('Error saving modified template:', err);
        res.status(500).json({ error: 'Failed to save template data' });
    }
});

// DALL-E Image Generation Endpoint
app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }

    try {
        const response = await axios.post(
            "https://api.openai.com/v1/images/generations",
            { prompt, n: 1, size: "1024x1024" },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const imageUrl = response.data.data[0]?.url;
        if (imageUrl) {
            res.json({ imageUrl });
        } else {
            res.status(500).json({ error: "Image generation failed" });
        }
    } catch (error) {
        console.error("Error generating image:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to generate image", details: error.message });
    }
});


// ChatGPT Analysis Endpoint
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

    // Step 1: Handle simple text message if no file uploaded
    if (!file) {
        const gptResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: userMessage }]
            },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
        );
        const reply = gptResponse.data.choices[0]?.message?.content;
        return res.json({ reply, imageAnalysis: null });
    }

    // Step 2: Image Handling - Vision API for Text Detection
    let fileContent = '';
    try {
        const imageBuffer = fs.readFileSync(file.path);
        const imageBase64 = imageBuffer.toString('base64');
        const visionResponse = await axios.post(visionApiUrl, {
            requests: [{ image: { content: imageBase64 }, features: [{ type: 'TEXT_DETECTION' }] }]
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

    // Step 3: Run the three separate GPT queries for Highlights, Summary, and Insights
    try {
        const [highlightsResponse, summaryResponse, insightsResponse] = await Promise.all([
            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: `Please provide three bullet point highlights for this image text: ${fileContent}` }]
            }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }),

            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: `Please provide a concise one-paragraph summary for this image text: ${fileContent}` }]
            }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }),

            axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: `Based on this image, what insights or opportunities for improvement can be drawn? ${fileContent}` }]
            }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' } })
        ]);

        const step1Highlights = highlightsResponse.data.choices[0]?.message?.content || "Key highlights not available.";
        const step2Summary = summaryResponse.data.choices[0]?.message?.content || "Summary not available.";
        const step3Insights = insightsResponse.data.choices[0]?.message?.content || "Learnings for future use not available.";

        res.json({
            reply: fileContent,
            imageAnalysis: { step1: step1Highlights, step2: step2Summary, step3: step3Insights }
        });

    } catch (error) {
        console.error('Error during GPT requests:', error);
        return res.status(500).json({ error: 'Something went wrong with the GPT request', details: error.message });
    } finally {
        if (file) {
            try {
                fs.unlinkSync(file.path);
                console.log('File deleted after processing');
            } catch (unlinkError) {
                console.error('Error deleting the file:', unlinkError);
            }
        }
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
