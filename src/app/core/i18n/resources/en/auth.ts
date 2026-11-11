import type { auth as source } from '../pt-MZ/auth';
import { TranslationOf } from '../../translation.types';

export const auth: TranslationOf<typeof source> = {
  tagline: 'Fleet, freight and profitability management for Mozambican transport companies.',
  fields: {
    email: 'Email',
    password: 'Password',
    fullName: 'Full name',
    companyName: 'Company name',
  },
  hints: {
    password: 'At least 8 characters.',
    companyName: 'Trading name, as your customers know it. You can change it later in settings.',
  },
  login: {
    title: 'Sign in',
    heading: 'Sign in to FleetOps MZ',
    subtitle: 'Use your account email and password.',
    submit: 'Sign in',
    noAccount: "Don't have an account?",
    switchToSignUp: 'Create account',
  },
  signUp: {
    heading: 'Create account',
    subtitle: 'Create your login. Next you will register your company.',
    submit: 'Create account',
    hasAccount: 'Already have an account?',
    switchToSignIn: 'Sign in',
    checkEmail: 'Account created. We sent a confirmation email to {email}. Open the link, then sign in here.',
  },
  onboarding: {
    title: 'Register company',
    heading: 'Register your company',
    subtitle: 'You will be the account owner and can invite your team next.',
    submit: 'Create company',
    created: 'Company created. Welcome to FleetOps MZ!',
    signOut: 'Use another account',
  },
  errors: {
    invalidCredentials: 'Incorrect email or password.',
    emailNotConfirmed: 'Please confirm your email first (check your inbox) and try again.',
    alreadyRegistered: 'An account with this email already exists. Sign in instead.',
    weakPassword: 'The password is too weak. Use at least 8 characters, mixing letters and numbers.',
    rateLimited: 'Too many attempts. Wait a few minutes and try again.',
    membership: 'Your company could not be loaded. Check your connection and sign in again.',
    generic: 'The operation could not be completed. Check your connection and try again.',
  },
};
