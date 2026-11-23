import { describe, expect, it } from 'vitest';
import { AmoCrm } from '../src/adapters/crm/amocrm';

/**
 * Contract test against a REAL amoCRM account and its TEST pipeline (M2).
 * Skipped unless these are set (never in CI by default):
 *
 *   AMO_TEST_BASE_URL=https://<sub>.amocrm.ru
 *   AMO_TEST_TOKEN=<long-lived token>
 *   AMO_TEST_PIPELINE_ID=…  AMO_TEST_STATUS_ID=<first stage>
 *   AMO_TEST_MANBA_FIELD_ID=… AMO_TEST_TELEGRAM_FIELD_ID=… (optional)
 *
 * It creates a contact, a Bitim, a note, tags and a task, then closes the task.
 * Clean the test pipeline afterwards if needed.
 */
const env = process.env;
const enabled = Boolean(env.AMO_TEST_BASE_URL && env.AMO_TEST_TOKEN && env.AMO_TEST_PIPELINE_ID && env.AMO_TEST_STATUS_ID);
const optionalNumber = (v: string | undefined) => (v ? Number(v) : undefined);

describe.skipIf(!enabled)('amoCRM contract (real test pipeline)', () => {
  it('runs the Ariza flow: contact → Bitim → tags, Manba, note → task', { timeout: 60_000 }, async () => {
    const crm = new AmoCrm({
      baseUrl: env.AMO_TEST_BASE_URL!,
      auth: { kind: 'token', token: env.AMO_TEST_TOKEN! },
      pipelineId: Number(env.AMO_TEST_PIPELINE_ID),
      firstStatusId: Number(env.AMO_TEST_STATUS_ID),
      manbaFieldId: optionalNumber(env.AMO_TEST_MANBA_FIELD_ID),
      telegramFieldId: optionalNumber(env.AMO_TEST_TELEGRAM_FIELD_ID),
    });
    const unique = String(Date.now()).slice(-7);
    const phone = `+99899${unique}`;
    const telegramId = `9${unique}`;

    expect(await crm.findContact({ phone })).toBeNull();
    const contact = await crm.createContact({ name: `Contract test ${unique}`, phone, telegramId });
    // amoCRM search is eventually consistent: allow it a moment.
    await new Promise((r) => setTimeout(r, 3000));
    expect((await crm.findContact({ phone }))?.id).toBe(contact.id);

    expect(await crm.findOpenBitim(contact.id)).toBeNull();
    const bitim = await crm.createBitim({ contactId: contact.id, name: `Contract test ${unique}` });
    expect((await crm.findOpenBitim(contact.id))?.id).toBe(bitim.id);

    await crm.addTags(bitim.id, ['bot_form', 'contract_test']);
    await crm.setManba(bitim.id, 'contract_test');
    await crm.addNote(bitim.id, `Ariza: contract test ${unique}`);
    const task = await crm.createTask({
      bitimId: bitim.id,
      kind: 'call',
      text: "Qo'ng'iroq qilish: contract test",
      dueAt: new Date(Date.now() + 15 * 60_000),
    });
    await crm.rescheduleTask(task.id, new Date(Date.now() + 60 * 60_000));
    await crm.closeTask(task.id, 'contract test');
  });
});
