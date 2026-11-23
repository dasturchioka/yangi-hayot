import { describe, expect, it } from 'vitest';
import { CrmAuthError, CrmUnavailableError } from '../src/adapters/crm/crm';
import { RecordingCrm } from '../src/adapters/crm/recording-crm';
import { RecordingMessenger } from '../src/adapters/messenger/recording-messenger';

// The fakes stand in for amoCRM and Telegram in every API test, so their
// recording and failure modes must behave as documented.

describe('RecordingCrm', () => {
  it('records calls and keeps the resulting contacts, Bitimlar, tags, notes and tasks', async () => {
    const crm = new RecordingCrm();
    const contact = await crm.createContact({ name: 'Aziz', phone: '+998901234567', telegramId: '700000001' });
    const bitim = await crm.createBitim({ contactId: contact.id, name: 'Jozibali Maskan' });
    await crm.addTags(bitim.id, ['bot_form']);
    await crm.addNote(bitim.id, 'Ariza: forma');
    const task = await crm.createTask({ bitimId: bitim.id, kind: 'call', text: "Qo'ng'iroq qilish", dueAt: new Date('2026-11-23T05:15:00Z') });
    await crm.closeTask(task.id, 'done');

    expect(await crm.findContact({ phone: '+998901234567' })).toMatchObject({ id: contact.id });
    expect(await crm.findContact({ telegramId: '700000001' })).toMatchObject({ id: contact.id });
    expect(await crm.findOpenBitim(contact.id)).toMatchObject({ id: bitim.id });
    expect(crm.bitimlar[0]).toMatchObject({ tags: ['bot_form'], notes: ['Ariza: forma'] });
    expect(crm.tasks[0]).toMatchObject({ kind: 'call', closed: true, result: 'done' });
    expect(crm.callsOf('addTags')).toEqual([[bitim.id, ['bot_form']]]);
  });

  it('throws CrmUnavailableError while unavailable, records the attempt, and recovers', async () => {
    const crm = new RecordingCrm();
    crm.fail('unavailable');

    await expect(crm.createContact({ name: 'Aziz' })).rejects.toBeInstanceOf(CrmUnavailableError);
    expect(crm.contacts).toHaveLength(0);
    expect(crm.calls).toMatchObject([{ method: 'createContact', ok: false }]);

    crm.recover();
    await crm.createContact({ name: 'Aziz' });
    expect(crm.contacts).toHaveLength(1);
  });

  it('throws CrmAuthError in auth failure mode', async () => {
    const crm = new RecordingCrm();
    crm.fail('auth');

    await expect(crm.findContact({ telegramId: '1' })).rejects.toBeInstanceOf(CrmAuthError);
  });
});

describe('RecordingMessenger', () => {
  it('delivers and records messages', async () => {
    const messenger = new RecordingMessenger();
    const result = await messenger.send({ chatId: '700000001', text: 'Salom', buttons: [[{ text: 'Menyu', startapp: 'home' }]] });

    expect(result.status).toBe('delivered');
    expect(messenger.deliveredTo('700000001')).toEqual([
      { chatId: '700000001', text: 'Salom', buttons: [[{ text: 'Menyu', startapp: 'home' }]] },
    ]);
  });

  it('reports "blocked" for a Mijoz who blocked the bot, others still get messages', async () => {
    const messenger = new RecordingMessenger();
    messenger.blockBy('700000001');

    expect(await messenger.send({ chatId: '700000001', text: 'x' })).toEqual({ status: 'blocked' });
    expect((await messenger.send({ chatId: '700000002', text: 'x' })).status).toBe('delivered');
    expect(messenger.deliveredTo('700000001')).toEqual([]);
  });

  it('reports errors in error mode until recovered', async () => {
    const messenger = new RecordingMessenger();
    messenger.fail('error');
    expect((await messenger.send({ chatId: '1', text: 'x' })).status).toBe('error');

    messenger.recover();
    expect((await messenger.send({ chatId: '1', text: 'x' })).status).toBe('delivered');
    expect(messenger.sent).toHaveLength(2);
  });
});
