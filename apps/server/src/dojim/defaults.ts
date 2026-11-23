import type { DojimSozlamalari } from '@yh/shared';

/**
 * Draft dojim texts until the client sends theirs (M14); the Administrator
 * edits them in «Matnlar va sozlamalar» → «Dojim».
 */
export const DEFAULT_DOJIM: DojimSozlamalari = {
  korish: {
    yoqilgan: true,
    matn: {
      uz:
        'Kecha {loyiha} majmuasidagi {planirovka} planirovkasini ko\'rgan edingiz. ' +
        'Uni o\'z ko\'zingiz bilan ko\'rmoqchimisiz? Qulay vaqtga ko\'rishga yoziling — menejer kutib oladi.',
      ru:
        'Вчера вы смотрели планировку {planirovka} в {loyiha}. ' +
        'Хотите увидеть её вживую? Запишитесь на просмотр в удобное время — менеджер встретит вас.',
    },
  },
  sevimliBand: {
    yoqilgan: true,
    matn: {
      uz:
        '{loyiha} majmuasidagi sevimli planirovkangiz — {planirovka} — hozircha band bo\'ldi. ' +
        'Mana shunga o\'xshash, hali sotuvda bo\'lganlari:',
      ru:
        'Ваша избранная планировка {planirovka} в {loyiha} сейчас занята. ' +
        'Вот похожие, которые ещё в продаже:',
    },
  },
  kelmadi: {
    yoqilgan: true,
    matn: {
      uz: '{loyiha} ko\'rishiga kela olmadingiz — hechqisi yo\'q. Sizga qulay yangi vaqtni tanlang.',
      ru: 'Не получилось приехать на просмотр в {loyiha} — ничего страшного. Выберите новое удобное время.',
    },
  },
  keldi: {
    yoqilgan: true,
    matn: {
      uz:
        '{loyiha} ko\'rishiga kelganingiz uchun rahmat! Qanday bo\'ldi? ' +
        'Oylik to\'lovni hisoblab ko\'ring yoki savolingizni shu yerga yozing — menejer javob beradi.',
      ru:
        'Спасибо, что приехали на просмотр в {loyiha}! Как вам? ' +
        'Рассчитайте ежемесячный платёж или напишите вопрос сюда — менеджер ответит.',
    },
  },
};
