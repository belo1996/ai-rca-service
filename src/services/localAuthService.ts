import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { upsertUser, getUserByEmail, User } from './dbService';

export const registerUser = async (email: string, password: string, name: string): Promise<User> => {
  const existingUser = getUserByEmail(email);
  if (existingUser) {
    throw new Error('User already exists');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const id = uuidv4();

  const newUser: User = {
    id,
    email,
    name,
    password_hash: hashedPassword
  };

  upsertUser(newUser);
  return newUser;
};

export const loginUser = async (email: string, password: string): Promise<User | null> => {
  const user = getUserByEmail(email);
  if (!user || !user.password_hash) {
    return null;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return null;
  }

  return user;
};
