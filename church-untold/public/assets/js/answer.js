import { submitAnswers } from "./api.js";
import { MAX_TEXT_LENGTH, QUESTIONS } from "./questions.js";

const SUBMITTED_KEY = "churchUntold:submitted:v1";
const form = document.querySelector("#answerForm");
const questionList = document.querySelector("#questionList");
const formError = document.querySelector("#formError");
const submitButton = document.querySelector("#submitButton");
const answerApp = document.querySelector("#answerApp");
const successState = document.querySelector("#successState");
const clearTestSubmission = document.querySelector("#clearTestSubmission");
const isTestMode = new URLSearchParams(window.location.search).get("test") === "1";

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function optionMarkup(question, option, index) {
  const inputType = question.type === "single" ? "radio" : "checkbox";
  return `
    <label class="choice-row">
      <input type="${inputType}" name="${question.id}" value="${escapeAttribute(option)}" />
      <span class="choice-control" aria-hidden="true"></span>
      <span>${option}</span>
      <span class="choice-index mono">${String(index + 1).padStart(2, "0")}</span>
    </label>`;
}

function choiceQuestionMarkup(question) {
  const optionRows = question.options.map((option, index) => optionMarkup(question, option, index)).join("");
  const otherIndex = question.options.length + 1;
  return `
    <div class="choices" data-choice-group="${question.id}">
      ${optionRows}
      <label class="choice-row choice-other-toggle">
        <input type="${question.type === "single" ? "radio" : "checkbox"}" name="${question.id}" value="其他" data-other-toggle />
        <span class="choice-control" aria-hidden="true"></span>
        <span>其他</span>
        <span class="choice-index mono">${String(otherIndex).padStart(2, "0")}</span>
      </label>
      <div class="other-field" data-other-field hidden>
        <label for="${question.id}Other">具体是……</label>
        <div class="text-input-wrap">
          <input id="${question.id}Other" name="${question.id}Other" type="text" maxlength="${MAX_TEXT_LENGTH * 2}" autocomplete="off" disabled />
          <span class="char-count mono" data-count-for="${question.id}Other">0/${MAX_TEXT_LENGTH}</span>
        </div>
      </div>
    </div>`;
}

function textQuestionMarkup(question) {
  return `
    <label class="text-answer" for="${question.id}">
      <span class="visually-hidden">你的回答</span>
      <textarea id="${question.id}" name="${question.id}" rows="3" maxlength="${MAX_TEXT_LENGTH * 2}" placeholder="例如：${escapeAttribute(question.placeholder)}"></textarea>
      <span class="char-count mono" data-count-for="${question.id}">0/${MAX_TEXT_LENGTH}</span>
    </label>`;
}

function questionMarkup(question) {
  const note = question.note ? `<span class="question-note">${question.note}</span>` : "";
  return `
    <section class="question-card" aria-labelledby="${question.id}Title">
      <div class="question-heading">
        <span class="question-number mono">${question.number}</span>
        ${note}
      </div>
      <h2 class="serif" id="${question.id}Title">${question.title}</h2>
      ${question.type === "text" ? textQuestionMarkup(question) : choiceQuestionMarkup(question)}
    </section>`;
}

function renderQuestions() {
  questionList.innerHTML = QUESTIONS.map(questionMarkup).join("");
}

function setCharacterCount(input) {
  const counter = document.querySelector(`[data-count-for="${input.id}"]`);
  if (counter) counter.textContent = `${Array.from(input.value).length}/${MAX_TEXT_LENGTH}`;
}

function enforceCharacterLimit(input) {
  const characters = Array.from(input.value);
  if (characters.length > MAX_TEXT_LENGTH) {
    input.value = characters.slice(0, MAX_TEXT_LENGTH).join("");
  }
  setCharacterCount(input);
}

function hasSubmittedOnThisDevice() {
  try {
    return Boolean(localStorage.getItem(SUBMITTED_KEY));
  } catch {
    return false;
  }
}

function rememberSubmission() {
  try {
    localStorage.setItem(SUBMITTED_KEY, new Date().toISOString());
  } catch {
    // Storage can be blocked while the API submission still succeeds.
  }
}

function syncOtherField(toggle) {
  const group = toggle.closest("[data-choice-group]");
  const field = group.querySelector("[data-other-field]");
  const input = field.querySelector("input");
  field.hidden = !toggle.checked;
  input.disabled = !toggle.checked;
  if (toggle.checked) input.focus({ preventScroll: true });
  if (!toggle.checked) {
    input.value = "";
    setCharacterCount(input);
  }
}

function enforceMultiLimit(group) {
  const checked = [...group.querySelectorAll('input[type="checkbox"]:checked')];
  const unchecked = [...group.querySelectorAll('input[type="checkbox"]:not(:checked)')];
  unchecked.forEach((input) => {
    input.disabled = checked.length >= 2;
    input.closest(".choice-row").classList.toggle("choice-disabled", input.disabled);
  });
}

function bindFormInteractions() {
  form.addEventListener("input", (event) => {
    if (event.target.matches("textarea, .other-field input")) enforceCharacterLimit(event.target);
    formError.hidden = true;
  });

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (!input.matches('input[type="radio"], input[type="checkbox"]')) return;

    const group = input.closest("[data-choice-group]");
    if (input.type === "radio") {
      const otherToggle = group.querySelector("[data-other-toggle]");
      syncOtherField(otherToggle);
    } else {
      if (input.hasAttribute("data-other-toggle")) syncOtherField(input);
      enforceMultiLimit(group);
    }
    formError.hidden = true;
  });
}

function trimmedValue(name) {
  return (form.elements[name]?.value || "").trim();
}

function collectAnswers() {
  const q1Choice = form.elements.q1.value || null;
  const q2Choices = [...form.querySelectorAll('input[name="q2"]:checked')].map((input) => input.value);
  return {
    q1: {
      choice: q1Choice,
      other: q1Choice === "其他" ? trimmedValue("q1Other") || null : null,
    },
    q2: {
      choices: q2Choices,
      other: q2Choices.includes("其他") ? trimmedValue("q2Other") || null : null,
    },
    q3: trimmedValue("q3"),
    q4: trimmedValue("q4"),
    q5: trimmedValue("q5"),
  };
}

function hasAtLeastOneAnswer(answers) {
  return Boolean(
    answers.q1.choice ||
    answers.q2.choices.length ||
    answers.q3 ||
    answers.q4 ||
    answers.q5,
  );
}

function showSuccess() {
  answerApp.hidden = true;
  successState.hidden = false;
  document.title = "答案已收录";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
  formError.scrollIntoView({ behavior: "smooth", block: "center" });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const answers = collectAnswers();
  if (!hasAtLeastOneAnswer(answers)) {
    showError("至少回答一题，才可以提交。留一点点真心话吧。");
    return;
  }

  submitButton.disabled = true;
  submitButton.classList.add("is-loading");
  submitButton.querySelector("span:first-child").textContent = "正在收录……";
  try {
    await submitAnswers(answers);
    rememberSubmission();
    showSuccess();
  } catch (error) {
    showError(error.message || "暂时提交不了，请检查网络后再试。");
    submitButton.disabled = false;
    submitButton.classList.remove("is-loading");
    submitButton.querySelector("span:first-child").textContent = "收录我的答案";
  }
});

renderQuestions();
bindFormInteractions();

if (isTestMode) clearTestSubmission.hidden = false;

clearTestSubmission.addEventListener("click", () => {
  try {
    localStorage.removeItem(SUBMITTED_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
  window.location.replace("/answer?test=1");
});

if (hasSubmittedOnThisDevice()) showSuccess();
