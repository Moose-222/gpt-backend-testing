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
const VISION_API_KEY = process.env.VISION_API_KEY;

// --- API URL Setup ---
let visionApiUrl = '';
if (VISION_API_KEY) {
    visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;
    console.log('✅ Vision API URL configured');
} else {
    console.error('❌ Google Vision API Key is missing');
    process.exit(1);
}

// --- Middleware ---
app.use(cors({
    origin: 'http://localhost:3000', // Update with your frontend URL
    methods: ['GET', 'POST']
}));
app.use(express.json());

// --- Multer for File Uploads ---
const upload = multer({ dest: '/tmp', limits: { fileSize: 10 * 1024 * 1024 } });

// --- Health Check Route ---
app.get('/', (req, res) => {
    res.send('✅ Backend is running successfully!');
});

// --- ChatGPT Endpoint ---
app.post('/api/chatgpt', upload.single('file'), async (req, res) => {
    const userMessage = req.body.message;
    const file = req.file;
    let fileContent = '';

    if (!userMessage && !file) {
        return res.status(400).json({ error: 'Either "message" or an uploaded file is required.' });
    }

    try {
        // Handle Vision API for Image Uploads
        if (file) {
            console.log('📂 Processing uploaded file...');
            const imageBuffer = fs.readFileSync(file.path);
            const imageBase64 = imageBuffer.toString('base64');

            const visionResponse = await axios.post(visionApiUrl, {
                requests: [{ image: { content: imageBase64 }, features: [{ type: 'TEXT_DETECTION' }] }]
            });

            fs.unlinkSync(file.path); // Delete temporary file
            fileContent = visionResponse.data.responses[0]?.textAnnotations?.[0]?.description || 'No text detected';
            console.log('✅ Vision API Response:', fileContent);
        }

        // Combine User Message and File Content
        const combinedInput = file ? `Extracted Image Text: ${fileContent}\nUser Input: ${userMessage || ''}` : userMessage;

        // Send Prompt to GPT-3.5
        const gptResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: combinedInput }]
            },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
        );

        const reply = gptResponse.data.choices[0]?.message?.content || 'No response from GPT.';
        console.log('🧠 GPT Response:', reply);

        res.json({ reply });
    } catch (error) {
        console.error('❌ Error processing ChatGPT request:', error.message);
        res.status(500).json({ error: 'Failed to process request', details: error.message });
    }
});

// --- DALL·E Image Generation Endpoint ---
app.post('/api/generate-image', async (req, res) => {
    const prompt = req.body.prompt;
    if (!prompt) return res.status(400).json({ error: 'A "prompt" field is required.' });

    try {
        const dalleResponse = await axios.post(
            'https://api.openai.com/v1/images/generations',
            { prompt, n: 1, size: '1024x1024' },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );

        const imageUrl = dalleResponse.data.data[0]?.url;
        console.log('🎨 DALL·E Image Generated:', imageUrl);
        res.json({ imageUrl });
    } catch (error) {
        console.error('❌ DALL·E Error:', error.message);
        res.status(500).json({ error: 'Failed to generate image', details: error.message });
    }
});

// Template Fetching Endpoint
app.get('/api/template/:type', (req, res) => {
    const { type } = req.params;
    const templatePath = path.join(TEMPLATES_DIR, `${type}.json`);

    fs.readFile(templatePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error fetching template "${type}":`, err.message);
            return res.status(404).json({ error: `Template "${type}" not found.` });
        }

        try {
            const template = JSON.parse(data);
            res.json({ template });
        } catch (parseError) {
            console.error('Error parsing template JSON:', parseError.message);
            res.status(500).json({ error: 'Error reading template file.' });
        }
    });
});

// --- Save Modified Template Endpoint ---
app.post('/api/save_template/:type', async (req, res) => {
    const templateType = req.params.type;
    const modifiedData = req.body;

    const savePath = path.join(__dirname, 'modified_templates', `${templateType}_modified.json`);

    try {
        await fs.promises.mkdir(path.join(__dirname, 'modified_templates'), { recursive: true });
        await fs.promises.writeFile(savePath, JSON.stringify(modifiedData, null, 2));
        console.log('✅ Template saved successfully at:', savePath);
        res.json({ message: 'Template saved successfully!' });
    } catch (error) {
        console.error('❌ Save Template Error:', error.message);
        res.status(500).json({ error: 'Failed to save template data' });
    }
});

// Endpoint to generate Gantt Chart data
app.post('/api/gantt-data', (req, res) => {
    const { content } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Template content is required.' });
    }

    try {
        // Parse the template content into Gantt data
        const lines = content.split('\n').filter(line => line.trim() !== '');
        const ganttData = [];
        let milestoneId = 1;

        lines.forEach(line => {
            // Detect milestones and tasks based on indentation
            if (line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.')) {
                // Milestone
                ganttData.push({
                    id: milestoneId,
                    task: line.trim(),
                    start_date: new Date().toISOString().split('T')[0], // Placeholder for start date
                    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Placeholder for end date
                });
                milestoneId++;
            } else if (line.startsWith('-')) {
                // Task under a milestone
                ganttData.push({
                    id: milestoneId,
                    task: line.trim().replace('-', '').trim(),
                    start_date: new Date().toISOString().split('T')[0], // Placeholder for start date
                    end_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Placeholder for end date
                    parent_id: milestoneId - 1 // Relate to the previous milestone
                });
            }
        });

        res.json(ganttData);
    } catch (error) {
        console.error('Error generating Gantt data:', error);
        res.status(500).json({ error: 'Failed to generate Gantt chart data.' });
    }
});


// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
