require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');
const { spawn } = require('child_process'); // Import spawn
const Razorpay = require('razorpay');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Razorpay client
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));


// User Schema and Model
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    paymentStatus: { type: String, default: 'pending' },
    hasSummarizeAccess: { type: Boolean, default: false }, // New field
    isBasicSubscriber: { type: Boolean, default: false },   // New field
    isPremiumSubscriber: { type: Boolean, default: false }, // New field
    hasOpenAIAccess: { type: Boolean, default: false }     // New field for OpenAI access
});
const User = mongoose.model('User', userSchema);

// Order Schema and Model
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderItems: [{
        name: String,
        quantity: Number,
        price: Number,
    }],
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String },
    paymentStatus: { type: String, default: 'pending' },
    paymentId: { type: String },
    orderStatus: { type: String, default: 'pending payment' },
    createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// CORS Configuration
const corsOptions = {
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoints
app.post('/api/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const newUser = new User({ name, email, password });
        await newUser.save();
        res.status(201).json({ message: 'User registered successfully', userId: newUser._id });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        res.status(200).json({ message: 'Login successful', userId: user._id, name: user.name, paymentStatus: user.paymentStatus, hasSummarizeAccess: user.hasSummarizeAccess, isBasicSubscriber: user.isBasicSubscriber, isPremiumSubscriber: user.isPremiumSubscriber, hasOpenAIAccess: user.hasOpenAIAccess });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        const userId = req.body.userId;
        const { orderItems, totalAmount, paymentMethod } = req.body;

        if (!userId || !orderItems || totalAmount === undefined || !paymentMethod) {
            return res.status(400).json({ message: 'Missing required order details' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Ensure the order item reflects the specific purchase
        let processedOrderItems = orderItems;
        if (paymentMethod === 'OpenAI Access') {
            processedOrderItems = [{ name: 'OpenAI Access', quantity: 1, price: totalAmount }];
        } else if (paymentMethod === 'Summarization Access') {
            processedOrderItems = [{ name: 'Summarization Access', quantity: 1, price: totalAmount }];
        } else if (paymentMethod === 'Basic Subscription') {
            processedOrderItems = [{ name: 'Basic Subscription', quantity: 1, price: totalAmount }];
        } else if (paymentMethod === 'Premium Subscription') {
            processedOrderItems = [{ name: 'Premium Subscription', quantity: 1, price: totalAmount }];
        }

        const newOrder = new Order({
            userId: user._id,
            orderItems: processedOrderItems, // Use the processed order items
            totalAmount,
            paymentMethod,
            paymentStatus: 'pending',
            orderStatus: 'pending payment'
        });

        await newOrder.save();

        res.status(201).json({ message: 'Order created successfully', orderId: newOrder._id });
    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ message: 'Server error during order creation' });
    }
});


app.post('/api/chatbot', async (req, res) => {
    try {
        const userMessage = req.body.message;
        const userId = req.body.userId; // Expecting userId to be sent with the message

        if (!userMessage) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const user = await User.findById(userId);
        if (!user || !user.hasOpenAIAccess) {
            return res.status(403).json({ error: 'OpenAI access is required to use this feature.' });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo", // Or another suitable model
            messages: [
                { role: "user", content: userMessage },
            ],
        });

        const chatbotResponse = completion.choices[0].message.content;
        res.json({ response: chatbotResponse });

    } catch (error) {
        console.error('Chatbot API error:', error);
        res.status(500).json({ error: 'Failed to get chatbot response' });
    }
});

app.post('/api/razorpay/create-order', async (req, res) => {
    try {
        const { amount } = req.body; // Amount in rupees
        const currency = 'INR';
        const options = {
            amount: amount * 100, // Convert to paise
            currency: currency,
            receipt: 'receipt_' + Date.now(), // Unique receipt ID
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        console.error('Razorpay create order error:', error);
        res.status(500).json({ message: 'Error creating Razorpay order' });
    }
});

app.post('/api/razorpay/verify-payment', async (req, res) => {
    try {
        const { order_id, payment_id, signature, orderId } = req.body;
        const key_secret = process.env.RAZORPAY_KEY_SECRET;

        const generated_signature = crypto.createHmac('sha256', key_secret)
            .update(order_id + "|" + payment_id)
            .digest('hex');

        if (generated_signature === signature) {
            // Payment is successful
            const order = await Order.findOneAndUpdate(
                { _id: orderId },
                { paymentStatus: 'completed', paymentId: payment_id, orderStatus: 'paid' },
                { new: true }
            );

            if (order) {
                const userId = order.userId;
                const paymentMethod = order.paymentMethod;

                // Grant access based on paymentMethod
                if (paymentMethod === 'Summarization Access') {
                    await User.findByIdAndUpdate(userId, { hasSummarizeAccess: true });
                } else if (paymentMethod === 'Basic Subscription') {
                    await User.findByIdAndUpdate(userId, { isBasicSubscriber: true });
                } else if (paymentMethod === 'Premium Subscription') {
                    await User.findByIdAndUpdate(userId, { isPremiumSubscriber: true });
                } else if (paymentMethod === 'OpenAI Access') {
                    await User.findByIdAndUpdate(userId, { hasOpenAIAccess: true });
                }
                // Add logic for other payment methods if needed

                return res.json({ message: 'Payment successful and access granted' });
            } else {
                return res.status(404).json({ message: 'Order not found' });
            }
        } else {
            // Payment verification failed
            return res.status(400).json({ message: 'Payment verification failed' });
        }
    } catch (error) {
        console.error('Razorpay verify payment error:', error);
        res.status(500).json({ message: 'Error verifying payment' });
    }
});

// Route to update user payment status (general - might not be directly used with Razorpay verification)
app.put('/api/users/:userId/payment', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(userId, { paymentStatus: 'completed' }, { new: true });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'Payment status updated successfully' });

    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ message: 'Server error updating payment status' });
    }
});

// Route to grant summarize access
app.put('/api/users/:userId/summarizeAccess', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(userId, { hasSummarizeAccess: true }, { new: true });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'Summarize access granted successfully' });

    } catch (error) {
        console.error('Error updating summarize access:', error);
        res.status(500).json({ message: 'Server error updating summarize access' });
    }
});

// Route to grant basic subscription
app.put('/api/users/:userId/subscribeBasic', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(userId, { isBasicSubscriber: true }, { new: true });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'Basic subscription granted successfully' });

    } catch (error) {
        console.error('Error updating basic subscription:', error);
        res.status(500).json({ message: 'Server error updating basic subscription' });
    }
});

// Route to grant premium subscription
app.put('/api/users/:userId/subscribePremium', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(userId, { isPremiumSubscriber: true }, { new: true });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'Premium subscription granted successfully' });

    } catch (error) {
        console.error('Error updating premium subscription:', error);
        res.status(500).json({ message: 'Server error updating premium subscription' });
    }
});

// Route to grant OpenAI access
app.put('/api/users/:userId/openaiAccess', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findByIdAndUpdate(userId, { hasOpenAIAccess: true }, { new: true });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'OpenAI access granted successfully' });

    } catch (error) {
        console.error('Error updating OpenAI access:', error);
        res.status(500).json({ message: 'Server error updating OpenAI access' });
    }
});

app.post('/api/summarize', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text to summarize is required' });
        }

        const pythonProcess = spawn('python', ['summarization_local.py', text]);
        let summary = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => {
            summary += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.error('Python summarization error:', errorOutput);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                res.json({ summary: summary.trim() });
            } else {
                res.status(500).json({ error: 'Failed to generate summary locally', details: errorOutput });
            }
        });

    } catch (error) {
        console.error('Error running local summarization:', error);
        res.status(500).json({ error: 'Failed to get summary' });
    }
});

// Catch-all route to serve the frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});