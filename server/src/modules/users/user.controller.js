import bcrypt from 'bcryptjs';
import { User } from '../auth/auth.model.js';

// Get list of users based on permissions
export async function getUsers(req, res, next) {
  try {
    let filter = {};
    if (req.user.role === 'admin') {
      // Admin sees teachers and students
      filter.role = { $in: ['teacher', 'student'] };
    } else if (req.user.role === 'teacher') {
      // Teacher only sees students
      filter.role = 'student';
    } else {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const users = await User.find(filter)
      .select('-password -__v')
      .populate('campus', 'name code')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: { users } });
  } catch (error) {
    return next(error);
  }
}

// Update a user's details
export async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const targetUser = await User.findById(id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    // Authorization check
    if (req.user.role === 'teacher' && targetUser.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Teachers can only edit students' });
    }

    // Do not allow password update here
    delete updateData.password;
    delete updateData.email; // Usually emails belong to identity, restricted
    delete updateData.role; // Role shifting restricted

    const updated = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true }).select('-password');
    return res.status(200).json({ success: true, message: 'User updated', data: { user: updated } });
  } catch (error) {
    return next(error);
  }
}

// Delete a user
export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const targetUser = await User.findById(id);
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    // Authorization check
    if (req.user.role === 'teacher' && targetUser.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Teachers can only delete students' });
    }

    await User.findByIdAndDelete(id);
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    return next(error);
  }
}

// Upload/Update Profile Picture for Logged in User
export async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });
    const profilePicture = req.file.path; // Cloudinary URL
    const user = await User.findByIdAndUpdate(req.user._id, { profilePicture }, { new: true });
    return res.status(200).json({ success: true, message: 'Profile picture updated', data: { user: user.toSafeObject() } });
  } catch (error) {
    return next(error);
  }
}

// Remove Profile Picture for Logged in User
export async function removeAvatar(req, res, next) {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, { $unset: { profilePicture: 1 } }, { new: true });
    return res.status(200).json({ success: true, message: 'Profile picture removed', data: { user: user.toSafeObject() } });
  } catch (error) {
    return next(error);
  }
}

// Bulk Promote Students
export async function bulkPromote(req, res, next) {
  try {
    // Only teachers/admins
    if (req.user.role === 'student') return res.status(403).json({ success: false, message: 'Unauthorized' });

    const { targetDepartment, targetYear, targetSection, newYear, newSection } = req.body;
    if (!targetDepartment || !targetYear) {
      return res.status(400).json({ success: false, message: 'Target Department and Target Year are required.' });
    }

    const filter = { role: 'student', department: targetDepartment, enrollmentYear: targetYear };
    if (targetSection) filter.section = targetSection;

    const updatePlayload = {};
    if (newYear) updatePlayload.enrollmentYear = newYear;
    if (newSection) updatePlayload.section = newSection;
    if (Object.keys(updatePlayload).length === 0) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const result = await User.updateMany(filter, { $set: updatePlayload });
    return res.status(200).json({ success: true, message: `Successfully updated ${result.modifiedCount} students.` });
  } catch (error) {
    return next(error);
  }
}

// Bulk Add Users
export async function bulkAddUsers(req, res, next) {
  try {
    if (req.user.role === 'student') return res.status(403).json({ success: false, message: 'Unauthorized' });

    const usersData = req.body;
    if (!Array.isArray(usersData) || usersData.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid payload: Array of users expected.' });
    }

    let addedCount = 0;
    let errors = [];

    // 1. Fetch all existing emails in one go
    const incomingEmails = usersData.map(u => u.email);
    const existingUsers = await User.find({ email: { $in: incomingEmails } }).select('email').lean();
    const existingEmailSet = new Set(existingUsers.map(u => u.email));

    // 2. Filter out existing users
    const newUsersData = usersData.filter(u => {
      if (existingEmailSet.has(u.email)) {
        errors.push(`Email ${u.email} already exists.`);
        return false;
      }
      return true;
    });

    // 3. Pre-hash passwords, caching identical passwords to save CPU and prevent event-loop freezing
    const passwordCache = {};
    const usersToInsert = [];
    
    for (const u of newUsersData) {
      if (!passwordCache[u.password]) {
        // Lower salt to 4 for bulk imports to prevent CPU lockups when uploading massive files with unique passwords
        passwordCache[u.password] = await bcrypt.hash(u.password, 4);
      }
      usersToInsert.push({
        ...u,
        password: passwordCache[u.password],
        avatarSeed: Math.random().toString(36).substring(7)
      });
    }

    // 4. Batch insert all new users
    if (usersToInsert.length > 0) {
      await User.insertMany(usersToInsert);
      addedCount = usersToInsert.length;
    }

    return res.status(200).json({ 
      success: true, 
      message: `Successfully added ${addedCount} users.`,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    return next(error);
  }
}

// Bulk Remove Users
export async function bulkRemoveUsers(req, res, next) {
  try {
    if (req.user.role === 'student') return res.status(403).json({ success: false, message: 'Unauthorized' });

    const emails = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid payload: Array of emails expected.' });
    }

    let filter = { email: { $in: emails } };
    if (req.user.role === 'teacher') {
      filter.role = 'student'; // Teachers can only bulk delete students
    }

    const result = await User.deleteMany(filter);
    
    return res.status(200).json({ 
      success: true, 
      message: `Successfully deleted ${result.deletedCount} users.`
    });
  } catch (error) {
    return next(error);
  }
}
