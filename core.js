/* Shared, dependency-free test logic. No partial credit. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TestCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ATTEMPT_SIZE = 30;

  function assertBank(bank) {
    if (!bank || bank.version !== 1 || !Array.isArray(bank.questions)) {
      throw new Error('Неверный формат базы вопросов.');
    }
    const seen = new Set();
    bank.questions.forEach(function (q) {
      if (!q.id || seen.has(q.id) || !q.html || typeof q.multiple !== 'boolean' ||
          !Array.isArray(q.options) || q.options.length < 2 || !Array.isArray(q.correct)) {
        throw new Error('Ошибка в вопросе ' + (q.id || '?'));
      }
      seen.add(q.id);
      const optionIds = new Set(q.options.map(function (o) { return o.id; }));
      if (optionIds.size !== q.options.length || !q.correct.length ||
          new Set(q.correct).size !== q.correct.length ||
          q.correct.some(function (id) { return !optionIds.has(id); }) ||
          (!q.multiple && q.correct.length !== 1)) {
        throw new Error('Ошибка в ключе ответов ' + q.id);
      }
    });
    if (bank.questions.filter(function (q) { return q.available; }).length < ATTEMPT_SIZE) {
      throw new Error('В базе недостаточно вопросов.');
    }
    return bank;
  }

  function randomUnit() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      const array = new Uint32Array(1);
      globalThis.crypto.getRandomValues(array);
      return array[0] / 4294967296;
    }
    return Math.random();
  }

  function sampleQuestions(bank, rng) {
    const random = rng || randomUnit;
    const pool = bank.questions.filter(function (q) { return q.available; }).slice();
    if (pool.length < ATTEMPT_SIZE) throw new Error('Недостаточно вопросов.');
    // Fisher-Yates: every available question has the same chance; no repeats.
    for (let i = pool.length - 1; i > 0; i--) {
      const value = random();
      if (!(value >= 0 && value < 1)) throw new Error('Некорректное случайное число.');
      const j = Math.floor(value * (i + 1));
      const temporary = pool[i];
      pool[i] = pool[j];
      pool[j] = temporary;
    }
    return pool.slice(0, ATTEMPT_SIZE);
  }

  function createAttempt(bank, number, rng) {
    return {
      version: 1,
      number: Math.max(1, Math.floor(number || 1)),
      questionIds: sampleQuestions(bank, rng).map(function (q) { return q.id; }),
      answers: {},
      startedAt: new Date().toISOString(),
      finishedAt: null,
      scrollY: 0
    };
  }

  function questionsFor(bank, attempt) {
    const byId = new Map(bank.questions.map(function (q) { return [q.id, q]; }));
    return attempt.questionIds.map(function (id) {
      const question = byId.get(id);
      if (!question) throw new Error('Вопрос больше не найден в базе: ' + id);
      return question;
    });
  }

  function choose(question, selected, optionId, checked) {
    if (!question.options.some(function (o) { return o.id === optionId; })) {
      throw new Error('Неизвестный вариант ответа.');
    }
    if (!question.multiple) return checked ? [optionId] : [];
    const ids = new Set(selected || []);
    if (checked) ids.add(optionId);
    else ids.delete(optionId);
    return question.options.filter(function (o) { return ids.has(o.id); }).map(function (o) { return o.id; });
  }

  function evaluateQuestion(question, answer) {
    const selected = Array.from(new Set(Array.isArray(answer) ? answer : []));
    const correct = new Set(question.correct);
    const missing = question.correct.filter(function (id) { return selected.indexOf(id) === -1; });
    const extra = selected.filter(function (id) { return !correct.has(id); });
    const exact = selected.length === correct.size && missing.length === 0 && extra.length === 0;
    return {
      id: question.id,
      status: !selected.length ? 'unanswered' : (exact ? 'correct' : 'incorrect'),
      selected: selected,
      missing: missing,
      extra: extra,
      earned: exact ? 1 : 0
    };
  }

  function grade(questions, answers) {
    const details = questions.map(function (q) { return evaluateQuestion(q, (answers || {})[q.id]); });
    const correct = details.filter(function (d) { return d.status === 'correct'; }).length;
    const unanswered = details.filter(function (d) { return d.status === 'unanswered'; }).length;
    return {
      total: details.length,
      correct: correct,
      incorrect: details.length - correct - unanswered,
      unanswered: unanswered,
      score: details.length ? Math.round(correct * 100 / details.length) : 0,
      details: details
    };
  }

  function answeredCount(attempt) {
    return attempt.questionIds.filter(function (id) {
      return Array.isArray(attempt.answers[id]) && attempt.answers[id].length > 0;
    }).length;
  }

  function restoreAttempt(bank, candidate) {
    if (!candidate || candidate.version !== 1 ||
        !Number.isInteger(candidate.number) || candidate.number < 1 ||
        !Array.isArray(candidate.questionIds) || candidate.questionIds.length !== ATTEMPT_SIZE ||
        new Set(candidate.questionIds).size !== ATTEMPT_SIZE ||
        !candidate.answers || typeof candidate.answers !== 'object' || Array.isArray(candidate.answers) ||
        !Number.isFinite(Date.parse(candidate.startedAt)) ||
        (candidate.finishedAt !== null && (!Number.isFinite(Date.parse(candidate.finishedAt)) ||
          Date.parse(candidate.finishedAt) < Date.parse(candidate.startedAt)))) return null;
    const byId = new Map(bank.questions.filter(function (q) { return q.available; }).map(function (q) { return [q.id, q]; }));
    const answers = {};
    for (const id of candidate.questionIds) {
      const question = byId.get(id);
      if (!question) return null;
      const values = candidate.answers[id] || [];
      const allowed = new Set(question.options.map(function (o) { return o.id; }));
      if (!Array.isArray(values) || new Set(values).size !== values.length ||
          values.some(function (v) { return !allowed.has(v); }) ||
          (!question.multiple && values.length > 1)) return null;
      if (values.length) answers[id] = values.slice();
    }
    return {
      version: 1,
      number: candidate.number,
      questionIds: candidate.questionIds.slice(),
      answers: answers,
      startedAt: candidate.startedAt,
      finishedAt: candidate.finishedAt,
      scrollY: Math.max(0, Number.isFinite(candidate.scrollY) ? candidate.scrollY : 0)
    };
  }

  return { ATTEMPT_SIZE: ATTEMPT_SIZE, assertBank: assertBank, sampleQuestions: sampleQuestions,
    createAttempt: createAttempt, questionsFor: questionsFor, choose: choose,
    evaluateQuestion: evaluateQuestion, grade: grade, answeredCount: answeredCount,
    restoreAttempt: restoreAttempt };
});
