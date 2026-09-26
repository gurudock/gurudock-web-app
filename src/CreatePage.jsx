import React, { useEffect, useMemo, useRef, useState } from "react";
import { handleWorkspaceWheel } from "./LibraryPage";
import { DocumentPreview } from "./LibraryPage";
import LibrarySidebar from "./LibrarySidebar";
import { contentService } from "./services/contentService";
import logoUrl from "./assets/gurudock-logo.png";
import { cacheGeneratedLibraryDocument } from "./libraryCache";
import { readAvailableContentCache, writeAvailableContentCache } from "./availableContentCache";

const chapters = [
  { name: "Chemical Reactions and Equations", topics: ["Types of Chemical Reactions", "Balancing Chemical Equations", "Combination and Decomposition Reactions", "Displacement Reactions", "Double Displacement Reactions"], selected: [0, 1, 3] },
  { name: "Acids, Bases and Salts", topics: ["Acids and Bases", "pH Scale", "More about Salts", "Uses in Daily Life", "Neutralisation Reactions", "Indicators"], selected: [0, 1, 2, 3] },
  { name: "Metals and Non-metals", topics: ["Physical Properties", "Chemical Properties", "Reactivity Series", "Extraction of Metals", "Corrosion"], selected: [] },
  { name: "Carbon and Its Compounds", topics: ["Bonding in Carbon", "Hydrocarbons", "Functional Groups", "Chemical Properties", "Ethanol and Ethanoic Acid", "Soaps and Detergents"], selected: [] },
];

const defaultSections = [
  { type: "MCQ", name: "Multiple Choice Questions", questions: 20, marks: 1, attempts: 20 },
  { type: "Short answer", name: "Short Answer Questions", questions: 8, marks: 3, attempts: 6 },
  { type: "Long answer", name: "Long Answer Questions", questions: 4, marks: 5, attempts: 3 },
  { type: "Case study", name: "Case Study / Source Based Questions", questions: 7, marks: 4, attempts: 7 },
];

const closedSectionIndexes = defaultSections.map((_, index) => index);

const modeDetails = {
  question: ["Create Question Paper", "Follow a few simple steps to generate a customised question paper."],
  assignment: ["Create Assignment", "Create a focused assignment by chapter and topic in a few simple steps."],
  worksheet: ["Create Worksheet", "Create a focused worksheet from one chapter with flexible question types."],
  lesson: ["Create Lesson Plan", "Plan an engaging classroom lesson in a few simple steps."],
};

const modeTabs = {
  question: { label: "Question Paper", description: "Assess learning", icon: "▤" },
  assignment: { label: "Assignment", description: "Practice concepts", icon: "☷" },
  worksheet: { label: "Worksheet", description: "Quick activities", icon: "▦" },
  lesson: { label: "Lesson Plan", description: "Plan your class", icon: "✦" },
};

const CURRICULUM_CACHE_KEY = "gurudock_curriculum_cache";
const CHAPTERS_CACHE_KEY = "gurudock_chapters_topics_cache";

function readContentCache(key, entryKey = "default") {
  try {
    const cache = JSON.parse(localStorage.getItem(key) || "{}");
    const entry = cache[entryKey];
    return entry ? entry.data : null;
  } catch {
    return null;
  }
}

function writeContentCache(key, data, entryKey = "default") {
  try {
    const cache = JSON.parse(localStorage.getItem(key) || "{}");
    cache[entryKey] = { cachedAt: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // Caching is best effort; the API remains the source of truth.
  }
}

export default function CreatePage({ initialMode = null }) {
  const [mode, setMode] = useState(() => {
    const requestedMode = initialMode || sessionStorage.getItem("create_mode") || new URLSearchParams(window.location.search).get("mode");
    sessionStorage.removeItem("create_mode");
    return ["question", "assignment", "worksheet", "lesson"].includes(requestedMode) ? requestedMode : "question";
  });
  const [step, setStep] = useState(1);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [chapterData, setChapterData] = useState(chapters);
  const [sections, setSections] = useState(defaultSections);
  const [collapsedSections, setCollapsedSections] = useState(closedSectionIndexes);
  const [questionTypes, setQuestionTypes] = useState(["Short answer"]);
  const [selectedAssignmentChapter, setSelectedAssignmentChapter] = useState(0);
  const [assignmentMaxMarks, setAssignmentMaxMarks] = useState(10);
  const [questionPaperMaxMarks, setQuestionPaperMaxMarks] = useState(80);
  const [generated, setGenerated] = useState(false);
  const [generatedPaper, setGeneratedPaper] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [className, setClassName] = useState("Class 10");
  const [subject, setSubject] = useState("Science");
  const [board, setBoard] = useState("CBSE");
  const [difficulty, setDifficulty] = useState("Medium");
  const [durationValue, setDurationValue] = useState("3");
  const [durationUnit, setDurationUnit] = useState("hours");
  const [lessonChapter, setLessonChapter] = useState(chapters[0].name);
  const [periods, setPeriods] = useState(1);
  const [curriculum, setCurriculum] = useState({});
  const [curriculumLoading, setCurriculumLoading] = useState(true);
  const [curriculumError, setCurriculumError] = useState("");
  const [userName, setUserName] = useState(() => localStorage.getItem("user_name") || "Teacher");
  const [chaptersError, setChaptersError] = useState("");
  const details = modeDetails[mode];
  const duration = durationValue
    ? `${durationValue} ${durationUnit.charAt(0).toUpperCase()}${durationUnit.slice(1)}`
    : "";
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  useEffect(() => {
    const syncUser = () => setUserName(localStorage.getItem("user_name") || "Teacher");
    window.addEventListener("auth-changed", syncUser);
    return () => window.removeEventListener("auth-changed", syncUser);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cachedCurriculum = readAvailableContentCache() || readContentCache(CURRICULUM_CACHE_KEY);
    if (cachedCurriculum && typeof cachedCurriculum === "object" && !Array.isArray(cachedCurriculum)) {
      setCurriculum(cachedCurriculum);
      setCurriculumLoading(false);
    }
    const loadCurriculum = async () => {
      try {
        const data = await contentService.getAvailableContent({ signal: controller.signal });
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Unable to load available curriculum.");
        writeContentCache(CURRICULUM_CACHE_KEY, data);
        writeAvailableContentCache(data);
        setCurriculum(data);
      } catch (error) {
        if (error.name !== "AbortError") setCurriculumError(error.message || "Unable to load available curriculum.");
      } finally {
        if (!controller.signal.aborted) setCurriculumLoading(false);
      }
    };
    loadCurriculum();
    return () => controller.abort();
  }, []);

  const boardOptions = Object.keys(curriculum);
  const classOptions = curriculum[board] ? Object.keys(curriculum[board]).sort((first, second) => Number(first) - Number(second)).map((value) => `Class ${value}`) : [];
  const subjectOptions = curriculum[board]?.[className.replace("Class ", "")] || [];

  useEffect(() => {
    if (!boardOptions.length) return;
    if (!boardOptions.includes(board)) setBoard(boardOptions.includes("CBSE") ? "CBSE" : boardOptions[0]);
  }, [boardOptions.join("|"), board]);

  useEffect(() => {
    if (!classOptions.length) return;
    if (!classOptions.includes(className)) setClassName(classOptions.includes("Class 10") ? "Class 10" : classOptions[0]);
  }, [classOptions.join("|"), className]);

  useEffect(() => {
    if (!subjectOptions.length) return;
    if (!subjectOptions.includes(subject)) setSubject(subjectOptions.includes("Science") ? "Science" : subjectOptions[0]);
  }, [subjectOptions.join("|"), subject]);

  useEffect(() => {
    const grade = String(className || "").replace(/^Class\s+/i, "").trim();
    if (!board || !grade || !subject) {
      setChapterData([]);
      setChapterIndex(0);
      setSelectedAssignmentChapter(0);
      setLessonChapter("");
      return undefined;
    }
    const controller = new AbortController();
    const cacheKey = JSON.stringify({ board, grade, subject, book_name: "" });
    const cachedChapters = readContentCache(CHAPTERS_CACHE_KEY, cacheKey);
    const applyChapters = (chaptersResponse) => {
      const nextChapters = Object.entries(chaptersResponse).map(([name, topics]) => ({
        name,
        topics: Array.isArray(topics) ? topics : [],
        selected: [],
      })).filter((chapter) => chapter.topics.length);
      if (!nextChapters.length) return false;
      setChapterData(nextChapters);
      setChapterIndex(0);
      setSelectedAssignmentChapter(0);
      setLessonChapter(nextChapters[0]?.name || "");
      return true;
    };
    if (cachedChapters && typeof cachedChapters === "object" && !Array.isArray(cachedChapters)) {
      applyChapters(cachedChapters);
    }
    const loadChapters = async () => {
      setChaptersError("");
      if (!cachedChapters) {
        setChapterData([]);
        setChapterIndex(0);
        setSelectedAssignmentChapter(0);
        setLessonChapter("");
      }
      try {
        const data = await contentService.getChaptersTopics({
            board,
            grade,
            subject,
            book_name: "",
          }, { signal: controller.signal });
        const chaptersResponse = data?.chapters || data?.data?.chapters;
        if (!chaptersResponse || typeof chaptersResponse !== "object" || Array.isArray(chaptersResponse)) {
          throw new Error("Unable to load chapters and topics.");
        }
        if (!applyChapters(chaptersResponse)) throw new Error("No chapters are available for this curriculum.");
        writeContentCache(CHAPTERS_CACHE_KEY, chaptersResponse, cacheKey);
      } catch (error) {
        if (error.name !== "AbortError") setChaptersError(error.message || "Unable to load chapters and topics.");
      }
    };
    loadChapters();
    return () => controller.abort();
  }, [board, className, subject]);

  const selectedChapters = useMemo(() => chapterData.filter((chapter) => chapter.selected.length), [chapterData]);
  const selectedTopics = selectedChapters.reduce((total, chapter) => total + chapter.selected.length, 0);
  const totalMarks = sections.reduce((total, section) => total + (Number(section.attempts) || 0) * (Number(section.marks) || 0), 0);
  const totalQuestions = sections.reduce((total, section) => total + (Number(section.attempts) || 0), 0);

  function changeMode(nextMode) {
    setMode(nextMode);
    setStep(1);
    setGenerated(false);
    setGeneratedPaper(null);
    setPreviewOpen(false);
    setGenerationError("");
    setQuestionTypes(["Short answer"]);
    setAssignmentMaxMarks(10);
    setQuestionPaperMaxMarks(80);
    setCollapsedSections(nextMode === "question" ? defaultSections.map((_, index) => index) : []);
    setBoard("CBSE");
    setDifficulty("Medium");
    setDurationValue("3");
    setDurationUnit("hours");
    setLessonChapter("");
    setPeriods(1);
    setSections(nextMode === "question"
      ? defaultSections
      : [{ type: "Short answer", name: "Short Answer Questions", questions: 5, marks: 2, attempts: 5 }]);
  }

  function toggleTopic(topicIndex) {
    if (mode !== "question") return;
    toggleTopicAt(chapterIndex, topicIndex);
  }

  function toggleTopicAt(index, topicIndex) {
    setChapterData((current) => current.map((chapter, chapterIndex) => chapterIndex !== index ? chapter : {
      ...chapter,
      selected: chapter.selected.includes(topicIndex) ? chapter.selected.filter((item) => item !== topicIndex) : [...chapter.selected, topicIndex],
    }));
  }

  function selectAllTopics() {
    if (mode !== "question") return;
    selectAllTopicsAt(chapterIndex);
  }

  function selectAllTopicsAt(index) {
    setChapterData((current) => current.map((chapter, chapterIndex) => chapterIndex !== index ? chapter : {
      ...chapter,
      selected: chapter.selected.length === chapter.topics.length ? [] : chapter.topics.map((_, topicIndex) => topicIndex),
    }));
  }

  function clearChapter(index) {
    setChapterData((current) => current.map((chapter, chapterIndex) => chapterIndex === index ? { ...chapter, selected: [] } : chapter));
  }

  function selectChapter(index) {
    setChapterIndex(index);
    if (chapterData[index].selected.length) {
      clearChapter(index);
    }
  }

  function toggleChapterTopics(index) {
    setChapterIndex(index);
    setChapterData((current) => current.map((chapter, chapterIndex) => chapterIndex !== index ? chapter : {
      ...chapter,
      selected: chapter.selected.length === chapter.topics.length ? [] : chapter.topics.map((_, topicIndex) => topicIndex),
    }));
  }

  function removeTopic(chapterIndex, topicIndex) {
    setChapterData((current) => current.map((chapter, index) => index !== chapterIndex ? chapter : {
      ...chapter,
      selected: chapter.selected.filter((item) => item !== topicIndex),
    }));
    setChapterIndex(chapterIndex);
  }

  function goTo(nextStep) {
    setGenerated(false);
    setGeneratedPaper(null);
    setPreviewOpen(false);
    setGenerationError("");
    setStep(nextStep);
  }

  async function generateContent() {
    setGenerationError("");
    if (mode === "lesson") {
      const lessonChapterData = chapterData[selectedAssignmentChapter];
      const lessonPeriods = Number(periods) || 0;
      if (!lessonChapterData) {
        setGenerationError("Select a chapter before generating the lesson plan.");
        return;
      }
      if (lessonPeriods <= 0) {
        setGenerationError("Enter the number of periods before generating the lesson plan.");
        return;
      }

      setGenerationLoading(true);
      try {
        const lessonPlan = await contentService.generateLessonPlan({
            subject,
            chapter: lessonChapterData.name,
            class_level: className.replace(/^Class\s+/i, ""),
            board,
            language: "english",
            num_periods: lessonPeriods,
            force_regenerate: false,
          });
        const contentId = lessonPlan.content_id || lessonPlan.contentId || lessonPlan.id;
        if (!contentId) throw new Error("Lesson plan was generated but no content ID was returned.");
        const generatedDocument = {
          ...lessonPlan,
          id: contentId,
          content_id: contentId,
          content_type: "lesson_plan",
          body: lessonPlan.body || lessonPlan,
          title: lessonPlan.title || `${subject} Lesson Plan - ${lessonChapterData.name}`,
          subject: lessonPlan.subject || subject,
          chapter: lessonPlan.chapter || lessonChapterData.name,
          class_level: lessonPlan.class_level || className.replace(/^Class\s+/i, ""),
          board: lessonPlan.board || board,
          language: lessonPlan.language || "english",
          num_periods: lessonPlan.num_periods ?? lessonPeriods,
        };
        cacheGeneratedLibraryDocument(generatedDocument);
        setGeneratedPaper(generatedDocument);
        setGenerated(true);
        setPreviewOpen(true);
      } catch (error) {
        setGenerationError(error.message || "Unable to generate the lesson plan.");
      } finally {
        setGenerationLoading(false);
      }
      return;
    }
    if (mode === "worksheet") {
      const worksheetChapter = chapterData[selectedAssignmentChapter];
      const worksheetQuestions = Number(sections[0]?.questions) || 0;
      const worksheetMarks = Number(assignmentMaxMarks) || 0;
      if (!worksheetChapter) {
        setGenerationError("Select a chapter before generating the worksheet.");
        return;
      }
      if (worksheetQuestions <= 0) {
        setGenerationError("Enter the number of questions before generating the worksheet.");
        return;
      }
      if (worksheetMarks <= 0) {
        setGenerationError("Enter total marks before generating the worksheet.");
        return;
      }

      setGenerationLoading(true);
      try {
        const worksheet = await contentService.generateWorksheet({
            subject,
            chapter: worksheetChapter.name,
            class_level: className.replace(/^Class\s+/i, ""),
            board,
            worksheet_type: questionTypes.map((type) => ({
              MCQ: "mcq",
              "Fill in the blank": "fill_in_blank",
              "Short answer": "short_answer",
              "Long answer": "long_answer",
            }[type] || type.toLowerCase())),
            difficulty: difficulty.toLowerCase(),
            language: "english",
            num_questions: worksheetQuestions,
            total_marks: worksheetMarks,
            variant_mode: false,
          });
        const contentId = worksheet.content_id || worksheet.contentId || worksheet.id;
        if (!contentId) throw new Error("Worksheet was generated but no content ID was returned.");
        const generatedDocument = {
          ...worksheet,
          id: contentId,
          content_id: contentId,
          content_type: "worksheet",
          body: worksheet.body || worksheet,
          title: worksheet.title || `${worksheetChapter.name} - Worksheet`,
          subject: worksheet.subject || subject,
          chapter: worksheet.chapter || worksheetChapter.name,
          class_level: worksheet.class_level || className.replace(/^Class\s+/i, ""),
          board: worksheet.board || board,
          difficulty: worksheet.difficulty || difficulty.toLowerCase(),
          total_marks: worksheet.total_marks ?? worksheetMarks,
        };
        cacheGeneratedLibraryDocument(generatedDocument);
        setGeneratedPaper(generatedDocument);
        setGenerated(true);
        setPreviewOpen(true);
      } catch (error) {
        setGenerationError(error.message || "Unable to generate the worksheet.");
      } finally {
        setGenerationLoading(false);
      }
      return;
    }
    if (mode === "assignment") {
      const assignmentChapter = chapterData[selectedAssignmentChapter];
      const assignmentQuestions = Number(sections[0]?.questions) || 0;
      const assignmentMarks = Number(assignmentMaxMarks) || 0;
      if (!assignmentChapter) {
        setGenerationError("Select a chapter before generating the assignment.");
        return;
      }
      if (assignmentQuestions <= 0) {
        setGenerationError("Enter the number of questions before generating the assignment.");
        return;
      }
      if (assignmentMarks <= 0) {
        setGenerationError("Enter maximum marks before generating the assignment.");
        return;
      }

      setGenerationLoading(true);
      try {
        const responseData = await contentService.generateAssignment({
            board,
            grade: className.replace(/^Class\s+/i, ""),
            subject,
            num_questions: assignmentQuestions,
            max_marks: assignmentMarks,
            question_type: questionTypes.map((type) => ({
              MCQ: "mcq",
              "Short answer": "short",
              "Long answer": "long",
              "Case study": "case_study",
            }[type] || type.toLowerCase())),
            duration,
            difficulty: difficulty.toLowerCase(),
            chapters: {
              [assignmentChapter.name]: assignmentChapter.topics,
            },
          });
        const assignment = responseData.data && typeof responseData.data === "object"
          ? responseData.data
          : responseData;
        const contentId = responseData.content_id
          || responseData.contentId
          || responseData.id
          || assignment.content_id
          || assignment.contentId
          || assignment.id;
        if (!contentId) throw new Error("Assignment was generated but no content ID was returned.");
        const generatedDocument = {
          ...responseData,
          ...assignment,
          id: contentId,
          content_id: contentId,
          content_type: "assignment",
          title: assignment.title || `${subject} Assignment - ${assignmentChapter.name}`,
          board: assignment.board || board,
          grade: assignment.grade || className.replace(/^Class\s+/i, ""),
          subject: assignment.subject || subject,
          max_marks: assignment.max_marks ?? assignmentMarks,
          duration: assignment.duration || duration,
          difficulty: assignment.difficulty || difficulty.toLowerCase(),
        };
        cacheGeneratedLibraryDocument(generatedDocument);
        setGeneratedPaper(generatedDocument);
        setGenerated(true);
        setPreviewOpen(true);
      } catch (error) {
        setGenerationError(error.message || "Unable to generate the assignment.");
      } finally {
        setGenerationLoading(false);
      }
      return;
    }
    if (mode !== "question") {
      setGenerated(true);
      return;
    }
    if (!selectedTopics) {
      setGenerationError("Select at least one topic before generating the question paper.");
      return;
    }
    if (!questionPaperMaxMarks || Number(questionPaperMaxMarks) <= 0) {
      setGenerationError("Enter maximum marks before generating the question paper.");
      return;
    }
    if (Number(questionPaperMaxMarks) !== totalMarks) {
      setGenerationError(`Maximum marks must equal the total of all section marks (${totalMarks}).`);
      return;
    }
    setGenerationLoading(true);
    try {
      const data = await contentService.generateQuestionPaper({
          board,
          grade: className.replace(/^Class\s+/i, ""),
          subject,
          max_marks: Number(questionPaperMaxMarks) || 0,
          duration,
          difficulty: difficulty.toLowerCase(),
          chapters: Object.fromEntries(selectedChapters.map((chapter) => [
            chapter.name,
            chapter.selected.map((topicIndex) => chapter.topics[topicIndex]),
          ])),
          sections: sections.map((section, index) => ({
            section_name: `Section ${String.fromCharCode(65 + index)}`,
            instruction: "Attempt questions",
            question_type: {
              MCQ: "mcq",
              "Short answer": "short_answer",
              "Long answer": "long_answer",
              "Case study": "Questions with subquestions",
            }[section.type] || section.type,
            total_questions: Number(section.questions) || 0,
            questions_to_attempt: Number(section.attempts) || 0,
            marks_per_question: Number(section.marks) || 0,
          })),
        });
      const paper = data.data && typeof data.data === "object" ? data.data : data;
      const contentId = data.content_id || data.contentId || data.id || paper.content_id || paper.contentId || paper.id;
      if (!contentId) throw new Error("Question paper was generated but no content ID was returned.");
      const generatedDocument = {
        ...data,
        ...paper,
        id: contentId,
        content_id: contentId,
        content_type: "question_paper",
        chapters: undefined,
        title: paper.title || `${subject} Question Paper`,
        board: paper.board || board,
        grade: paper.grade || className.replace(/^Class\s+/i, ""),
        subject: paper.subject || subject,
        max_marks: paper.max_marks ?? questionPaperMaxMarks,
        duration: paper.duration || duration,
        difficulty: paper.difficulty || difficulty.toLowerCase(),
      };
      cacheGeneratedLibraryDocument(generatedDocument);
      setGeneratedPaper(generatedDocument);
      setGenerated(true);
      setPreviewOpen(true);
    } catch (error) {
      setGenerationError(error.message || "Unable to generate the question paper.");
    } finally {
      setGenerationLoading(false);
    }
  }

  function addSection() {
    setSections((current) => [...current, { type: "Short answer", name: "Short Answer Questions", questions: 5, marks: 2, attempts: 5 }]);
  }

  function updateSection(index, key, value) {
    setSections((current) => current.map((section, sectionIndex) => {
      if (sectionIndex !== index) return section;
      if (!["questions", "marks", "attempts"].includes(key)) {
        return { ...section, [key]: value };
      }

      if (value === "") {
        return { ...section, [key]: "" };
      }

      const numericValue = Math.max(1, Number(value) || 1);

      if (key === "questions") {
        const currentAttempts = Number(section.attempts) || 1;
        return {
          ...section,
          questions: numericValue,
          attempts: Math.min(currentAttempts, numericValue),
        };
      }

      if (key === "attempts") {
        const currentQuestions = Number(section.questions) || 1;
        return {
          ...section,
          attempts: Math.min(numericValue, currentQuestions),
        };
      }

      return { ...section, marks: numericValue };
    }));
  }

  function removeSection(index) {
    setSections((current) => current.length > 1 ? current.filter((_, sectionIndex) => sectionIndex !== index) : current);
    setCollapsedSections((current) => current.filter((sectionIndex) => sectionIndex !== index).map((sectionIndex) => sectionIndex > index ? sectionIndex - 1 : sectionIndex));
  }

  function toggleSection(index) {
    setCollapsedSections((current) => current.includes(index)
      ? current.filter((sectionIndex) => sectionIndex !== index)
      : [...current, index]);
  }

  function toggleQuestionType(type) {
    setQuestionTypes((current) => current.includes(type)
      ? current.filter((item) => item !== type)
      : [...current, type]);
  }

  return (
    <div className="create-app generator-create" onWheel={(event) => handleWorkspaceWheel(event, ".generator-create-content")}>
      <LibrarySidebar activeItem="create" />
      <main className="generator-create-main">
        <header className="home-topbar create-home-topbar">
          <div>
            <span className="home-topbar-eyebrow">Teacher workspace</span>
            <h1>Create</h1>
          </div>
          <a className="home-mobile-brand" href="/home" aria-label="GuruDock home">
            <img src={logoUrl} alt="" />
            <strong>GuruDock</strong>
          </a>
          <div className="home-topbar-user">
            <span className="home-avatar">{initials || "T"}</span>
            <strong>{userName}</strong>
          </div>
        </header>
        <section className="generator-create-content">
          <div className="generator-mode-tabs">
            {Object.entries(modeTabs).map(([key, tab]) => <button key={key} className={mode === key ? "active" : ""} onClick={() => changeMode(key)} type="button"><span className={`generator-mode-icon generator-mode-icon-${key}`} aria-hidden="true">{tab.icon}</span><span className="generator-mode-copy"><strong>{tab.label}</strong><small>{tab.description}</small></span></button>)}
          </div>
          {chaptersError && <small className="generator-error">{chaptersError}</small>}
          {mode !== "lesson" && <div className="generator-progress">
            {(mode === "question" ? ["Basic details", "Select chapters & topics", "Set paper structure", "Review & generate"] : ["Basic details", "Select Chapter", "Set paper structure", "Review & generate"]).map((label, index) => <React.Fragment key={label}><div className={`generator-step ${step === index + 1 ? "active" : ""} ${step > index + 1 ? "done" : ""}`}><b>{step > index + 1 ? "✓" : index + 1}</b><span><strong>{label}</strong><small>{["Choose class and subject", "Choose what to include", "Configure document", "Check and create"][index]}</small></span></div>{index < 3 && <i className={step > index + 1 ? "done" : ""} />}</React.Fragment>)}
          </div>}

          {step === 1 && <StepOne mode={mode} classNameName={className} setClassName={setClassName} subject={subject} setSubject={setSubject} board={board} setBoard={setBoard} difficulty={difficulty} setDifficulty={setDifficulty} durationValue={durationValue} setDurationValue={setDurationValue} durationUnit={durationUnit} setDurationUnit={setDurationUnit} questionPaperMaxMarks={questionPaperMaxMarks} setQuestionPaperMaxMarks={setQuestionPaperMaxMarks} lessonChapter={lessonChapter} setLessonChapter={setLessonChapter} periods={periods} setPeriods={setPeriods} details={details} boardOptions={boardOptions.length ? boardOptions : ["CBSE"]} classOptions={classOptions.length ? classOptions : ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"]} subjectOptions={subjectOptions.length ? subjectOptions : ["Mathematics", "Science", "English", "Social Science", "Computer Science"]} curriculumLoading={curriculumLoading} curriculumError={curriculumError} onNext={() => goTo(2)} />}
          {step === 2 && <StepTwo mode={mode} chapters={chapterData} chapterIndex={chapterIndex} selectedAssignmentChapter={selectedAssignmentChapter} setSelectedAssignmentChapter={setSelectedAssignmentChapter} onSelectChapter={selectChapter} onFocusChapter={setChapterIndex} onToggleChapterTopics={toggleChapterTopics} onToggle={toggleTopic} onToggleTopicAt={toggleTopicAt} onSelectAll={selectAllTopics} onSelectAllAt={selectAllTopicsAt} onClearChapter={clearChapter} onRemoveTopic={removeTopic} onBack={() => goTo(1)} onNext={() => goTo(mode === "lesson" ? 4 : 3)} />}
          {step === 3 && <StepThree mode={mode} sections={sections} collapsedSections={collapsedSections} questionTypes={questionTypes} chapter={chapterData[selectedAssignmentChapter]} assignmentMaxMarks={assignmentMaxMarks} onAssignmentMaxMarksChange={setAssignmentMaxMarks} onToggleSection={toggleSection} onToggleQuestionType={toggleQuestionType} onUpdate={updateSection} onRemove={removeSection} onAdd={addSection} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
          {step === 4 && <StepFour mode={mode} classNameName={className} subject={subject} board={board} difficulty={difficulty} duration={duration} lessonChapter={lessonChapter} periods={periods} chapters={chapterData} selectedAssignmentChapter={selectedAssignmentChapter} sections={sections} questionTypes={questionTypes} assignmentMaxMarks={assignmentMaxMarks} questionPaperMaxMarks={questionPaperMaxMarks} totalMarks={totalMarks} totalQuestions={totalQuestions} generated={generated} generationLoading={generationLoading} generationError={generationError} onBack={() => goTo(mode === "lesson" ? 1 : 3)} onGenerate={generateContent} onView={() => setPreviewOpen(true)} />}
        </section>
      </main>
      {generatedPaper && previewOpen && <DocumentPreview document={generatedPaper} details={generatedPaper} onClose={() => setPreviewOpen(false)} />}
      {generationLoading && <div className="generator-loading-backdrop" role="status" aria-live="polite" aria-label={`Generating ${mode === "question" ? "question paper" : mode === "lesson" ? "lesson plan" : mode}`}>
        <div className="generator-loading-dialog">
          <div className="generator-loading-spinner" aria-hidden="true" />
          <div>
            <strong>Generating your {mode === "question" ? "question paper" : mode === "lesson" ? "lesson plan" : mode}</strong>
            <p>Preparing your content. This may take a moment...</p>
          </div>
        </div>
      </div>}
      {generationError && <div className="generator-warning-backdrop" role="presentation" onClick={() => setGenerationError("")}>
        <div className="generator-warning" role="alertdialog" aria-modal="true" aria-labelledby="generator-warning-title" onClick={(event) => event.stopPropagation()}>
          <div className="generator-warning-icon" aria-hidden="true">!</div>
          <div>
            <h2 id="generator-warning-title">Please check your details</h2>
            <p>{generationError}</p>
          </div>
          <button type="button" className="generator-warning-close" onClick={() => setGenerationError("")} aria-label="Close warning">×</button>
          <button type="button" className="generator-button primary generator-warning-action" onClick={() => setGenerationError("")}>Okay</button>
        </div>
      </div>}
    </div>
  );
}

function StepOne({ mode, classNameName, setClassName, subject, setSubject, board, setBoard, difficulty, setDifficulty, durationValue, setDurationValue, durationUnit, setDurationUnit, questionPaperMaxMarks, setQuestionPaperMaxMarks, lessonChapter, setLessonChapter, periods, setPeriods, details, boardOptions, classOptions, subjectOptions, curriculumLoading, curriculumError, onNext }) {
  const isLesson = mode === "lesson";
  return <section className="generator-screen"><div className="generator-screen-head"><div><h2>Let’s start with the basics</h2><p>{isLesson ? "Choose the class, subject, board and number of periods for your lesson plan." : `Choose the class, subject, board, duration and difficulty for your ${details[0].replace("Create ", "").toLowerCase()}.`}</p>{curriculumLoading && <small>Loading available curriculum...</small>}{curriculumError && <small className="generator-error">{curriculumError} Using default options.</small>}</div></div><div className="generator-card generator-fields"><Select label="Board" value={board} setValue={setBoard} options={boardOptions} /><Select label="Class" value={classNameName} setValue={setClassName} options={classOptions} /><Select label="Subject" value={subject} setValue={setSubject} options={subjectOptions} />{!isLesson && <><div className="generator-duration-field"><label>Duration <span>*</span></label><div className="generator-duration-input"><input type="number" min="1" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} placeholder="Enter duration" /><ThemedSelect value={durationUnit} onChange={setDurationUnit} options={[{ value: "minutes", label: "Minutes" }, { value: "hours", label: "Hours" }]} ariaLabel="Duration unit" /></div></div>{mode === "question" && <div className="generator-field"><label>Maximum marks <span>*</span></label><input type="number" min="1" value={questionPaperMaxMarks} onChange={(event) => setQuestionPaperMaxMarks(event.target.value)} placeholder="Enter maximum marks" /></div>}<div className="generator-difficulty-field"><label>Difficulty <span>*</span></label><div className="generator-difficulty-options">{["Easy", "Medium", "Hard"].map((option) => <button className={difficulty === option ? "selected" : ""} key={option} type="button" aria-pressed={difficulty === option} onClick={() => setDifficulty(option)}>{option}</button>)}</div></div></>}{isLesson && <MiniInput label="Number of periods *" value={periods} onChange={setPeriods} />}</div><div className="generator-actions"><span /><button className="generator-button primary" onClick={onNext}>Next →</button></div></section>;
}

function StepTwo({ mode, chapters, chapterIndex, selectedAssignmentChapter, setSelectedAssignmentChapter, onSelectChapter, onFocusChapter, onToggleChapterTopics, onToggle, onToggleTopicAt, onSelectAll, onSelectAllAt, onClearChapter, onRemoveTopic, onBack, onNext }) {
  const chapter = chapters[chapterIndex];
  const allTopicsSelected = Boolean(chapter && chapter.selected.length === chapter.topics.length);
  const [openMobileChapters, setOpenMobileChapters] = useState([chapterIndex]);
  const selectedChapters = chapters.filter((item) => item.selected.length);
  const selectedChapterCount = selectedChapters.length;
  const selectedTopicCount = selectedChapters.reduce((total, item) => total + item.selected.length, 0);

  function toggleMobileChapter(index) {
    if (mode !== "question") {
      setSelectedAssignmentChapter(index);
      return;
    }
    onFocusChapter(index);
    setOpenMobileChapters((current) => current.includes(index)
      ? current.filter((item) => item !== index)
      : [...current, index]);
  }

  return (
    <section className={`generator-screen ${mode === "question" ? "generator-selection-step" : ""}`}>
      <div className="generator-screen-head">
        <div>
          <h2>{mode === "question" ? "Select chapters and topics" : "Chapters"}</h2>
          {mode === "question" && <p>Choose the chapters and specific topics you want to include in the question paper.</p>}
        </div>
        <div className="generator-selected-count" aria-live="polite">
          {mode === "question" ? (
            <>
              <span><b>{selectedChapterCount}</b> chapters</span>
              <span><b>{selectedTopicCount}</b> topics</span>
            </>
          ) : (
            <span><b>1</b> chapter</span>
          )}
        </div>
      </div>

      <div className="generator-mobile-chapters">
        {chapters.map((item, index) => {
          const isOpen = openMobileChapters.includes(index);
          const allSelected = item.selected.length === item.topics.length;
          const assignmentSelected = selectedAssignmentChapter === index;
          return (
            <div className={`generator-mobile-chapter generator-mobile-chapter-${mode}`} key={item.name}>
              <button
                className={`generator-chapter ${item.selected.length || assignmentSelected ? "selected" : ""}`}
                onClick={() => toggleMobileChapter(index)}
                type="button"
              >
                <span
                  className={`generator-checkbox ${item.selected.length || assignmentSelected ? "checked" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    mode === "question" ? onToggleChapterTopics(index) : setSelectedAssignmentChapter(index);
                  }}
                  role="checkbox"
                  aria-checked={mode === "question" ? allSelected : assignmentSelected}
                  tabIndex={0}
                />
                <span><strong>{item.name}</strong></span>
                <em>{mode === "question" ? `${item.selected.length}/${item.topics.length} topics` : ""}</em>
                {mode === "question" && <b>{isOpen ? "▴" : "▾"}</b>}
              </button>
              {mode === "question" && isOpen && (
                <div className="generator-mobile-topics">
                  <button className="generator-select-all" type="button" onClick={() => onSelectAllAt(index)}>
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                  {item.topics.map((topic, topicIndex) => (
                    <button
                      className="generator-topic"
                      key={topic}
                      title={topic}
                      onClick={() => onToggleTopicAt(index, topicIndex)}
                      type="button"
                    >
                      <span className={`generator-checkbox ${item.selected.includes(topicIndex) ? "checked" : ""}`} />
                      <span className="generator-topic-label">{topicIndex + 1}. {topic}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="generator-workspace">
        {mode === "question" ? (
          <>
            <div className="generator-column generator-chapters-column">
              <div className="generator-panel-heading">
                <div>
                  <h3>Chapters</h3>
                  <small>Choose what to include</small>
                </div>
                <span className="generator-panel-count">{chapters.length}</span>
              </div>
              <div className="generator-panel-list">
                {chapters.map((item, index) => {
                  const selected = item.selected.length > 0;
                  const isActive = index === chapterIndex;
                  return (
                    <button
                      className={`generator-chapter ${selected ? "selected" : ""} ${isActive ? "active" : ""}`}
                      key={item.name}
                      onClick={() => onSelectChapter(index)}
                      type="button"
                    >
                      <span
                        className={`generator-checkbox ${item.selected.length === item.topics.length ? "checked" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleChapterTopics(index);
                        }}
                        role="checkbox"
                        aria-checked={item.selected.length === item.topics.length}
                        aria-label={`Select all topics in ${item.name}`}
                        tabIndex={0}
                      />
                      <span className="generator-chapter-copy">
                        <strong>{item.name}</strong>
                        <small>{item.selected.length ? `${item.selected.length} topics selected` : "No topics selected"}</small>
                      </span>
                      <span className="generator-chapter-progress">{item.selected.length}/{item.topics.length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="generator-column generator-topics-column">
              <div className="generator-topic-head">
                <div>
                  <h3>Topics</h3>
                  <small>{chapter?.name || "Select a chapter"}</small>
                </div>
                {chapter && (
                  <button className="generator-select-all" type="button" onClick={onSelectAll}>
                    {allTopicsSelected ? "Clear all" : "Select all"}
                  </button>
                )}
              </div>
              <div className="generator-panel-list">
                {chapter?.topics.map((topic, index) => {
                  const selected = chapter.selected.includes(index);
                  return (
                    <button
                      className={`generator-topic ${selected ? "selected" : ""}`}
                      key={topic}
                      title={topic}
                      onClick={() => onToggle(index)}
                      type="button"
                    >
                      <span className={`generator-checkbox ${selected ? "checked" : ""}`} />
                      <span className="generator-topic-label">{topic}</span>
                      <span className="generator-topic-state">{selected ? "Selected" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="generator-column generator-selection-column">
              <div className="generator-panel-heading">
                <div>
                  <h3>Your selection</h3>
                  <small>{selectedTopicCount ? "Ready for your question paper" : "Topics you choose appear here"}</small>
                </div>
                {selectedTopicCount > 0 && <span className="generator-panel-count">{selectedTopicCount}</span>}
              </div>
              <div className="generator-selection-list">
                {selectedChapters.map((item) => {
                  const itemIndex = chapters.indexOf(item);
                  return (
                    <div className="generator-selection" key={item.name}>
                      <div className="generator-selection-head">
                        <strong>{item.name}</strong>
                        <span>{item.selected.length}</span>
                        <button
                          type="button"
                          onClick={() => onClearChapter(itemIndex)}
                          aria-label={`Remove all selected topics from ${item.name}`}
                          title="Remove chapter topics"
                        >
                          ×
                        </button>
                      </div>
                      <ul>
                        {item.selected.map((index) => (
                          <li key={index}>
                            <span>{item.topics[index]}</span>
                            <button
                              type="button"
                              onClick={() => onRemoveTopic(itemIndex, index)}
                              aria-label={`Remove ${item.topics[index]}`}
                              title={`Remove ${item.topics[index]}`}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
                {!selectedTopicCount && (
                  <div className="generator-selection-empty">
                    <span className="generator-selection-empty-icon" aria-hidden="true">＋</span>
                    <strong>No topics selected yet</strong>
                    <span>Choose a chapter, then select the topics to include.</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="generator-assignment-wrapper">
            <div className="generator-assignment-grid">
              {chapters.map((item, index) => (
                <button
                  className={`generator-assignment-chapter ${selectedAssignmentChapter === index ? "selected" : ""}`}
                  key={item.name}
                  onClick={() => setSelectedAssignmentChapter(index)}
                  type="button"
                >
                  <span className="generator-radio" />
                  <span><strong>{item.name}</strong></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="generator-actions">
        <button className="generator-button" onClick={onBack}>← Back</button>
        <button className="generator-button primary" onClick={onNext}>Next →</button>
      </div>
    </section>
  );
}

function StepThree({ mode, sections, collapsedSections, questionTypes, chapter, assignmentMaxMarks, onAssignmentMaxMarksChange, onToggleSection, onToggleQuestionType, onUpdate, onRemove, onAdd, onBack, onNext }) {
  const section = sections[0];
  const typeOptions = [
    ["MCQ", "Choose the correct answer"],
    ...(mode === "worksheet" ? [["Fill in the blank", "Complete the missing word or phrase"]] : []),
    ["Short answer", "Answer briefly in a few lines"],
    ["Long answer", "Detailed descriptive response"],
    ["Case study", "Questions based on a given source"],
  ];

  const typeLabels = mode === "worksheet" ? ["MCQ", "Fill in the blank", "Short answer", "Long answer"] : ["MCQ", "Short answer", "Long answer", "Case study"];
  return <section className="generator-screen"><div className="generator-screen-head"><div><h2>{mode === "question" ? "Design your question paper" : `Set ${mode} questions`}</h2><p>{mode === "question" ? "Add sections and decide question type, number of questions, marks and attempts." : `Set the number of questions, maximum marks and question types for your ${mode}.`}</p></div></div>{mode === "question" ? <div className="generator-structure">{sections.map((item, index) => { const collapsed = collapsedSections.includes(index); const questions = Number(item.questions) || 0; const attempts = Number(item.attempts) || 0; const marks = Number(item.marks) || 0; return <div className={`generator-section-card ${collapsed ? "collapsed" : ""}`} key={`${item.type}-${index}`}><div className="generator-section-top generator-section-toggle" onClick={() => onToggleSection(index)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onToggleSection(index); }}><button className="generator-remove-section" type="button" aria-label={`Remove section ${String.fromCharCode(65 + index)}`} onClick={(event) => { event.stopPropagation(); onRemove(index); }}>×</button><b>{String.fromCharCode(65 + index)}</b><span><strong>Section {String.fromCharCode(65 + index)}</strong><small>{item.name}</small></span>  {collapsed && <span className="generator-section-summary">{item.type} · {questions} questions · {attempts} attempts · {marks} mark{marks === 1 ? "" : "s"} each · {attempts * marks} total</span>}<button className="generator-collapse-section" type="button" aria-label={`${collapsed ? "Expand" : "Collapse"} section ${String.fromCharCode(65 + index)}`} onClick={(event) => { event.stopPropagation(); onToggleSection(index); }}>{collapsed ? "▾" : "▴"}</button></div>{!collapsed && <><div className="generator-section-fields"><MiniSelect label="Question type" value={item.type} options={typeLabels} onChange={(value) => onUpdate(index, "type", value)} /><MiniInput label="Number of questions" value={item.questions} onChange={(value) => onUpdate(index, "questions", value)} /><MiniInput label="Questions to attempt" value={item.attempts} onChange={(value) => onUpdate(index, "attempts", value)} /><MiniInput label="Marks per question" value={item.marks} onChange={(value) => onUpdate(index, "marks", value)} /></div><strong className="generator-total">Section total: {attempts * marks} marks</strong></>}</div>; })}</div> : <div className="generator-assignment-structure"><div className="generator-assignment-question-card"><div className="generator-assignment-heading"><b>CH</b><span><strong>Chapter {chapter ? chapter.name : ""}</strong><small>All topics in this chapter are included automatically</small></span></div><div className="generator-assignment-settings"><MiniInput label="Number of questions" value={section.questions} onChange={(value) => onUpdate(0, "questions", value)} /><MiniInput label="Maximum marks" value={assignmentMaxMarks} onChange={onAssignmentMaxMarksChange} /><div className="generator-assignment-total"><label>Total marks</label><strong>{assignmentMaxMarks || 0}</strong></div></div><div className="generator-question-types"><div><strong>Type of questions</strong><small>Select one or more</small></div><div className="generator-type-options">{typeOptions.map(([type, description]) => <button key={type} className={questionTypes.includes(type) ? "selected" : ""} type="button" onClick={() => onToggleQuestionType(type)}><span /><strong>{type}<small>{description}</small></strong></button>)}</div></div></div><div className="generator-total">{mode === "worksheet" ? "Worksheet" : "Assignment"} total: {section.questions} questions · {assignmentMaxMarks || 0} marks · 1 chapter</div></div>} {mode === "question" && <button className="generator-add-section" onClick={onAdd} type="button">＋ Add section</button>}<div className="generator-actions"><button className="generator-button" onClick={onBack}>← Back</button><button className="generator-button primary" onClick={onNext}>Next →</button></div></section>;
}

function StepFour({ mode, classNameName, subject, board, difficulty, duration, lessonChapter, periods, chapters, selectedAssignmentChapter, sections, questionTypes, assignmentMaxMarks, totalMarks, totalQuestions, questionPaperMaxMarks, generated, generationLoading, generationError, onBack, onGenerate, onView }) {
  const isLesson = mode === "lesson";
  const assignmentChapter = chapters[selectedAssignmentChapter];
  const selectedChapterName = assignmentChapter?.name || lessonChapter;
  return <section className="generator-screen"><div className="generator-screen-head"><div><h2>Review your {isLesson ? "lesson plan" : mode === "question" ? "question paper" : mode}</h2><p>Check your selections before generating the final {isLesson ? "lesson plan" : mode}.</p></div></div><div className="generator-review-grid"><div><div className="generator-review-card"><h3>Basic details</h3><div className="generator-summary"><span>Class<strong>{classNameName}</strong></span><span>Subject<strong>{subject}</strong></span><span>Board<strong>{board}</strong></span>{!isLesson && <><span>Maximum marks<strong>{mode === "assignment" ? assignmentMaxMarks || "Not specified" : questionPaperMaxMarks || "Not specified"}</strong></span><span>Duration<strong>{duration || "Not specified"}</strong></span><span>Difficulty<strong>{difficulty}</strong></span></>}{isLesson ? <><span>Chapter<strong>{selectedChapterName}</strong></span><span>Periods<strong>{periods}</strong></span></> : null}</div></div>{isLesson ? <div className="generator-review-card"><h3>Lesson plan</h3><p>Generate a structured lesson plan for <b>{selectedChapterName}</b> across <b>{periods}</b> {periods === 1 ? "period" : "periods"}.</p></div> : mode === "question" ? <><div className="generator-review-card"><h3>Chapters & topics</h3><div className="generator-review-scroll">{chapters.filter((item) => item.selected.length).map((item) => <p key={item.name}><b>{item.name}:</b> {item.selected.map((index) => item.topics[index]).join(", ")}</p>)}</div></div><div className="generator-review-card"><h3>Paper structure</h3>{sections.map((section, index) => <p key={index}>Section {String.fromCharCode(65 + index)} · {section.type} · {section.questions} questions · {section.attempts} attempts × {section.marks} = <b>{Number(section.attempts || 0) * Number(section.marks || 0)}</b> marks</p>)}<strong>Total: {totalQuestions} questions · {totalMarks} marks</strong></div></> : <><div className="generator-review-card"><h3>Chapter</h3><p><b>{assignmentChapter?.name}</b></p><p>All topics in this chapter are included.</p></div><div className="generator-review-card"><h3>Question settings</h3><p><b>{sections[0].questions || 0}</b> questions · <b>{assignmentMaxMarks || 0}</b> maximum marks</p><p>Types: <b>{questionTypes.join(", ")}</b></p></div></>}</div></div><div className="generator-actions"><button className="generator-button" onClick={onBack}>← Back</button><button className="generator-button primary" onClick={generated ? onView : onGenerate} disabled={generationLoading}>{generationLoading ? "Generating..." : generated ? "View" : "▣ Generate"}</button></div></section>;
}

function Select({ label, value, setValue, options, placeholder = false }) {
  const optionValues = placeholder ? options.slice(1) : options;
  return <div className="generator-field"><label>{label} <span>*</span></label><ThemedSelect value={value} onChange={setValue} options={optionValues} placeholder={placeholder ? "Select board" : ""} /></div>;
}

function MiniSelect({ label, value, options, onChange }) {
  return <div><label>{label}</label><ThemedSelect value={value} onChange={onChange} options={options} /></div>;
}

function ThemedSelect({ value, onChange, options, placeholder = "", ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState("bottom");
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const selectedOption = normalizedOptions.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const updatePlacement = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const estimatedMenuHeight = Math.min(normalizedOptions.length * 48 + 12, 247);
      const spaceBelow = window.innerHeight - trigger.bottom;
      const spaceAbove = trigger.top;
      setPlacement(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow ? "top" : "bottom");
    };
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, normalizedOptions.length]);

  const selectOption = (option) => {
    onChange(option.value);
    setOpen(false);
  };

  return <div className={`generator-select ${open ? "open" : ""}`} ref={rootRef}>
    <button ref={buttonRef} type="button" className="generator-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={selectedOption ? "" : "placeholder"}>{selectedOption?.label || placeholder || "Select an option"}</span>
      <span className="generator-select-chevron" aria-hidden="true" />
    </button>
    {open && <div className={`generator-select-menu ${placement}`} role="listbox" aria-label={ariaLabel || "Options"}>
      {normalizedOptions.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={`generator-select-option ${option.value === value ? "selected" : ""}`} key={option.value} onMouseDown={(event) => event.preventDefault()} onClick={() => selectOption(option)}>{option.label}<span aria-hidden="true">{option.value === value ? "✓" : ""}</span></button>)}
    </div>}
  </div>;
}

function MiniInput({ label, value, onChange }) {
  return <div><label>{label}</label><input type="number" min="1" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
