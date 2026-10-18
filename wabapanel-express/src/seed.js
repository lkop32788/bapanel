require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const SystemSettings = require('./models/SystemSettings');
const Permission = require('./models/Permission');
const LandingPage = require('./models/LandingPage');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wapto');
    console.log('Connected to MongoDB');

    // Seed Super Admin
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@wabapanel.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456';
    const existingAdmin = await User.findOne({ role: 'super_admin' });
    if (!existingAdmin) {
      await User.create({
        name: 'Super Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'super_admin',
        status: 'active',
      });
      console.log(`Super Admin created (${adminEmail})`);
    }

    // Seed demo user
    const existingUser = await User.findOne({ email: 'demo@wabapanel.com' });
    if (!existingUser) {
      const Workspace = require('./models/Workspace');

      const user = await User.create({
        name: 'Demo User',
        email: 'demo@wabapanel.com',
        password: 'demo123456',
        role: 'user',
        status: 'active',
      });

      const workspace = await Workspace.create({
        name: "Demo User's Workspace",
        owner: user._id,
        members: [{ user: user._id, role: 'owner' }],
      });

      user.currentWorkspace = workspace._id;
      await user.save();
      console.log('Demo User created (demo@wabapanel.com / demo123456)');
    }

    // Seed Permissions
    const existingPerms = await Permission.countDocuments();
    if (existingPerms === 0) {
      const fullPerms = {
        dashboard: { view: true },
        contacts: { view: true, create: true, edit: true, delete: true, import: true, export: true },
        segments: { view: true, create: true, edit: true, delete: true },
        tags: { view: true, create: true, edit: true, delete: true },
        templates: { view: true, create: true, edit: true, delete: true },
        campaigns: { view: true, create: true, edit: true, delete: true },
        automations: { view: true, create: true, edit: true, delete: true },
        chat: { view: true, send: true, assign: true },
        teams: { view: true, manage: true },
        settings: { view: true, manage: true },
        pipelines: { view: true, create: true, edit: true, delete: true },
        forms: { view: true, create: true, edit: true, delete: true },
        shortLinks: { view: true, create: true, edit: true, delete: true },
        whatsapp: { connect: true, manage: true },
        analytics: { view: true },
      };

      const agentPerms = {
        dashboard: { view: true },
        contacts: { view: true, create: true, edit: true, delete: false, import: false, export: false },
        segments: { view: true, create: false, edit: false, delete: false },
        tags: { view: true, create: false, edit: false, delete: false },
        templates: { view: true, create: false, edit: false, delete: false },
        campaigns: { view: true, create: false, edit: false, delete: false },
        automations: { view: true, create: false, edit: false, delete: false },
        chat: { view: true, send: true, assign: false },
        teams: { view: true, manage: false },
        settings: { view: false, manage: false },
        pipelines: { view: true, create: true, edit: true, delete: false },
        forms: { view: true, create: false, edit: false, delete: false },
        shortLinks: { view: true, create: false, edit: false, delete: false },
        whatsapp: { connect: false, manage: false },
        analytics: { view: true },
      };

      await Permission.create([
        { role: 'super_admin', permissions: fullPerms },
        { role: 'admin', permissions: fullPerms },
        { role: 'user', permissions: fullPerms },
        { role: 'agent', permissions: agentPerms },
      ]);
      console.log('Permissions seeded');
    }

    // Seed System Settings
    const existingSettings = await SystemSettings.countDocuments();
    if (existingSettings === 0) {
      await SystemSettings.create({
        appName: 'WabaPanel',
        appEmail: 'support@wabapanel.com',
        appDescription: 'WhatsApp Business API Platform',
        ai: {
          providers: [
            { name: 'openai', displayName: 'OpenAI GPT-4o', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', isActive: false },
            { name: 'deepseek', displayName: 'DeepSeek Chat', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', isActive: false },
            { name: 'xai', displayName: 'xAI Grok Beta', model: 'grok-beta', baseUrl: 'https://api.x.ai/v1', isActive: false },
            { name: 'gemini', displayName: 'Google Gemini', model: 'gemini-pro', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', isActive: false },
          ],
          defaultProvider: 'openai',
        },
        languages: [
          { code: 'en', name: 'English', isDefault: true, isActive: true },
          { code: 'hi', name: 'Hindi', isDefault: false, isActive: true },
        ],
        currencies: [
          { code: 'INR', name: 'Indian Rupee', symbol: '₹', isDefault: true, isActive: true },
          { code: 'USD', name: 'US Dollar', symbol: '$', isDefault: false, isActive: true },
        ],
      });
      console.log('System Settings seeded');
    }

    // Seed Landing Page
    const existingLP = await LandingPage.countDocuments();
    if (existingLP === 0) {
      await LandingPage.create({
        hero: {
          title: 'Transform Your Business Communication',
          subtitle: 'Powerful WhatsApp Business API Platform',
          description: 'Send campaigns, automate responses, manage contacts - all from one platform.',
          ctaText: 'Get Started Free',
          ctaLink: '/register',
        },
        features: [
          { icon: 'MessageSquare', title: 'WhatsApp Messaging', description: 'Send and receive messages through WhatsApp Business API', order: 0 },
          { icon: 'Zap', title: 'Automation Builder', description: 'Create powerful automation flows with our visual builder', order: 1 },
          { icon: 'BarChart3', title: 'Analytics Dashboard', description: 'Track message delivery, read rates, and campaign performance', order: 2 },
          { icon: 'Users', title: 'Contact Management', description: 'Organize contacts with tags, segments, and custom fields', order: 3 },
          { icon: 'Send', title: 'Broadcast Campaigns', description: 'Send bulk messages to targeted audiences', order: 4 },
          { icon: 'Bot', title: 'AI Powered', description: 'Integrate AI for smart auto-replies and customer support', order: 5 },
        ],
        faq: [
          { question: 'What is WhatsApp Business API?', answer: 'WhatsApp Business API is a solution for medium and large businesses to communicate with customers at scale through WhatsApp.', order: 0 },
          { question: 'How do I get started?', answer: 'Sign up for a free account, connect your WhatsApp Business number, and start sending messages.', order: 1 },
        ],
        isPublished: true,
      });
      console.log('Landing Page seeded');
    }

    console.log('Seed complete!');
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
};

seed();
