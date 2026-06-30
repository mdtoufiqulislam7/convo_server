import { Router } from 'express';
import { verifyWebhook, receiveWebhookEvent } from '../controllers/webhookController';
import { createLead, getStats } from '../controllers/leadController';

const router = Router();

// Webhook endpoints
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhookEvent);

// Lead registration endpoint
router.post('/leads', createLead);

// Analytics statistics endpoint
router.get('/stats', getStats);

export default router;
