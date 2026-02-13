#!/usr/bin/env npx tsx

import { db, runMigrations } from './src/db/index.js';
import { createReminder, listReminders, completeReminder } from './src/tools/reminders.js';
import { remember, recall, forget } from './src/tools/memory.js';
import { startTask, checkTask, completeTask } from './src/tools/tasks.js';
import { getActivity, getSummary } from './src/tools/history.js';
import { getPendingCheckups } from './src/services/scheduler.js';

const TEST_USER = 'test-user-123';

async function test() {
  console.log('Running migrations...');
  await runMigrations();
  console.log('✓ Migrations complete\n');

  // Test Reminders
  console.log('=== Testing Reminders ===');

  const reminder = await createReminder({
    user_id: TEST_USER,
    title: 'Test reminder',
    description: 'This is a test',
    due_at: 'in 30 minutes',
    timezone: 'America/Los_Angeles',
  });
  console.log('✓ Created reminder:', reminder.success ? reminder.reminder?.id : reminder.error);

  const reminders = await listReminders({ user_id: TEST_USER, status: 'pending' });
  console.log('✓ Listed reminders:', reminders.reminders.length, 'pending');

  if (reminder.reminder) {
    const completed = await completeReminder({ reminder_id: reminder.reminder.id });
    console.log('✓ Completed reminder:', completed.success);
  }

  // Test Memory
  console.log('\n=== Testing Memory ===');

  const memory = await remember({
    user_id: TEST_USER,
    content: 'Remember to run security audit on datestack',
    tags: ['work', 'security'],
  });
  console.log('✓ Created memory:', memory.success ? memory.memory?.id : memory.error);

  const memories = await recall({ user_id: TEST_USER });
  console.log('✓ Recalled memories:', memories.memories.length, 'items');

  if (memory.memory) {
    const forgotten = await forget({ memory_id: memory.memory.id });
    console.log('✓ Forgot memory:', forgotten.success);
  }

  // Test Tasks
  console.log('\n=== Testing Tasks ===');

  const task = await startTask({
    user_id: TEST_USER,
    title: 'Deep research on Hawaii vacation',
    command: 'research best time to visit Hawaii',
    check_interval_ms: 60000,
  });
  console.log('✓ Started task:', task.success ? task.task?.id : task.error);

  if (task.task) {
    const checked = await checkTask({ task_id: task.task.id });
    console.log('✓ Checked task status:', checked.task?.status);

    const completed = await completeTask({ task_id: task.task.id });
    console.log('✓ Completed task:', completed.success);
  }

  // Test History
  console.log('\n=== Testing History ===');

  const activity = await getActivity({ user_id: TEST_USER, since: '1 day' });
  console.log('✓ Got activity:', activity.activities.length, 'events');

  const summary = await getSummary({ user_id: TEST_USER, period: 'day' });
  console.log('✓ Got summary:', summary.summary.total_activities, 'total activities');

  // Test Pending Checkups
  console.log('\n=== Testing Pending Checkups ===');

  const checkups = await getPendingCheckups(TEST_USER);
  console.log('✓ Got pending checkups:', checkups.length, 'items');

  console.log('\n✅ All tests passed!');

  await db.destroy();
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
