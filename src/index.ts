import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes/api';
import { initializeDatabase } from './config/db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so the client can query our API
app.use(cors());

// Parse incoming JSON request payloads
app.use(express.json());

// Mount the API router
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Express typescript server is running.' });
});

async function startServer() {
  try {
    // Run database migrations/table creation
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`Server running successfully on port ${PORT}`);
      console.log(`Webhook Verify GET: http://localhost:${PORT}/api/webhook`);
      console.log(`Webhook Event POST: http://localhost:${PORT}/api/webhook`);
      console.log(`Leads POST:         http://localhost:${PORT}/api/leads`);
      console.log(`=========================================`);
    });
  } catch (error) {
    console.error('Failed to initialize server due to database error:', error);
    process.exit(1);
  }
}

startServer();
