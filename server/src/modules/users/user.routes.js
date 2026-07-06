import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { getUsers, updateUser, deleteUser, uploadAvatar, removeAvatar, bulkPromote, bulkAddUsers, bulkRemoveUsers } from './user.controller.js';
import { avatarUploader } from '../../utils/upload.js';

const router = Router();

router.use(protect);

// Self endpoints applicable to all logged-in users
router.post('/me/avatar', avatarUploader.single('file'), uploadAvatar);
router.delete('/me/avatar', removeAvatar);

// Admin / Teacher operations
router.use(authorize('admin', 'teacher'));

router.get('/', getUsers);
router.post('/bulk-promote', bulkPromote);
router.post('/bulk-add', bulkAddUsers);
router.post('/bulk-remove', bulkRemoveUsers);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
