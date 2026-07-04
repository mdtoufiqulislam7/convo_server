import { Router } from 'express';
import { verifyWebhook, receiveWebhookEvent } from '../controllers/webhookController';
import { createLead, getStats } from '../controllers/leadController';
import { register, login, authenticateToken, requireAdmin } from '../controllers/authController';
import { createPayment, callbackPayment } from '../controllers/bkashController';
import { 
  getMessages, 
  getUsers, 
  updateUserRole, 
  getPayments, 
  getLeads, 
  getProducts, 
  createProduct 
} from '../controllers/adminController';

const router = Router();

// --- 1. Public Messenger Webhook Endpoints ---
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhookEvent);

// --- 2. Authentication Endpoints ---
router.post('/auth/register', register);
router.post('/auth/login', login);

// --- 3. Public Stats & Leads Endpoints ---
router.get('/stats', getStats);
router.post('/leads', createLead);

// --- 4. bKash Tokenized Payment Endpoints ---
router.post('/bkash/create', authenticateToken, createPayment);
router.get('/bkash/callback', callbackPayment);

// --- 5. Protected Admin Operations Endpoints ---
router.get('/admin/messages', authenticateToken, requireAdmin, getMessages);
router.get('/admin/users', authenticateToken, requireAdmin, getUsers);
router.post('/admin/users/:id/role', authenticateToken, requireAdmin, updateUserRole);
router.get('/admin/payments', authenticateToken, requireAdmin, getPayments);
router.get('/admin/leads', authenticateToken, requireAdmin, getLeads);
router.get('/admin/products', authenticateToken, requireAdmin, getProducts);
router.post('/admin/products', authenticateToken, requireAdmin, createProduct);

export default router;
