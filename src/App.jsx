import { useEffect, useMemo, useRef, useState } from "react";
import ballImg from "./assets/ball.png";
import fieldBgImg from "./assets/goal-background.jpg";
import keeperLeftImg from "./assets/left.png";
import keeperLeftLowImg from "./assets/left-low.png";
import keeperMiddleHighImg from "./assets/middle-high.png";
import keeperMiddleLowImg from "./assets/middle-low.png";
import keeperRightImg from "./assets/right.png";
import keeperRightLowImg from "./assets/right-low.png";
import keeperStandImg from "./assets/stand.png";
import { QUESTION_SECONDS } from "./config/game";
import { ANSWER_LABELS, QUESTIONS } from "./data/questions";
import {
  fetchMockLeaderboard,
  hasMockApiConfig,
  submitMockScore,
} from "./utils/leaderboard";
import "./App.css";

const MATCH_SECONDS = 7 * 60;
const GAME_STATE_KEY = "penalty_quiz_live_state_v1";
const KEEPER_ZONES = ["left", "middle", "right"];

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function shuffle(arr) {
  const next = [...arr];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function loadPersistedState() {
  try {
    const rawLocal = localStorage.getItem(GAME_STATE_KEY);
    const rawSession = sessionStorage.getItem(GAME_STATE_KEY);
    const raw = rawLocal || rawSession;
    if (!raw) {
      return null;
    }

    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") {
      return null;
    }

    const order = Array.isArray(saved.questionOrder)
      ? saved.questionOrder
          .map((value) => Number(value))
          .filter(
            (value) =>
              Number.isInteger(value) && value >= 0 && value < QUESTIONS.length,
          )
      : [];

    const safeOrder = order.length > 0 ? order : shuffle([...QUESTIONS.keys()]);

    return {
      phase: typeof saved.phase === "string" ? saved.phase : "menu",
      showGuidePopup: Boolean(saved.showGuidePopup),
      showNamePopup: Boolean(saved.showNamePopup),
      turnState:
        saved.turnState === "answering" ||
        saved.turnState === "aiming" ||
        saved.turnState === "resolving"
          ? saved.turnState
          : "answering",
      inputName: typeof saved.inputName === "string" ? saved.inputName : "",
      playerName: typeof saved.playerName === "string" ? saved.playerName : "",
      questionOrder: safeOrder,
      questionIndex: clampNumber(saved.questionIndex, 0, safeOrder.length - 1),
      matchTimeLeft: clampNumber(saved.matchTimeLeft, 0, MATCH_SECONDS),
      timeLeft: clampNumber(saved.timeLeft, 0, QUESTION_SECONDS),
      score: clampNumber(saved.score, 0, 999999),
      goalCount: clampNumber(saved.goalCount, 0, 999999),
      answeredCount: clampNumber(saved.answeredCount, 0, 999999),
      feedback:
        typeof saved.feedback === "string"
          ? saved.feedback
          : "Trả lời đúng để nhận lượt sút!",
      feedbackType:
        saved.feedbackType === "neutral" ||
        saved.feedbackType === "correct" ||
        saved.feedbackType === "wrong" ||
        saved.feedbackType === "timeout"
          ? saved.feedbackType
          : "neutral",
      goalkeeperPose:
        KEEPER_ZONES.includes(saved.goalkeeperPose)
          ? saved.goalkeeperPose
          : "stand",
      keeperLean:
        saved.keeperLean === "low-left" ||
        saved.keeperLean === "low-middle" ||
        saved.keeperLean === "low-right"
          ? saved.keeperLean
          : "",
      ballFlight:
        saved.ballFlight === "goal" || saved.ballFlight === "miss"
          ? saved.ballFlight
          : "idle",
      selectedOption:
        typeof saved.selectedOption === "string" ? saved.selectedOption : null,
    };
  } catch {
    return null;
  }
}

function persistState(snapshot) {
  const encoded = JSON.stringify(snapshot);
  localStorage.setItem(GAME_STATE_KEY, encoded);
  sessionStorage.setItem(GAME_STATE_KEY, encoded);
}

function clearPersistedState() {
  localStorage.removeItem(GAME_STATE_KEY);
  sessionStorage.removeItem(GAME_STATE_KEY);
}

function App() {
  const restoredStateRef = useRef(loadPersistedState());
  const restoredState = restoredStateRef.current;
  const needsResolveRecoveryRef = useRef(Boolean(restoredState));

  const [phase, setPhase] = useState(restoredState?.phase ?? "menu");
  const [showGuidePopup, setShowGuidePopup] = useState(
    restoredState?.showGuidePopup ?? false,
  );
  const [showNamePopup, setShowNamePopup] = useState(
    restoredState?.showNamePopup ?? false,
  );
  const [leaderboardRows, setLeaderboardRows] = useState([]);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [showResumePrompt, setShowResumePrompt] = useState(
    Boolean(restoredState && restoredState.phase === "playing"),
  );
  const [turnState, setTurnState] = useState(
    restoredState?.turnState ?? "answering",
  );
  const [inputName, setInputName] = useState(restoredState?.inputName ?? "");
  const [playerName, setPlayerName] = useState(restoredState?.playerName ?? "");
  const [questionOrder, setQuestionOrder] = useState(
    restoredState?.questionOrder ?? shuffle([...QUESTIONS.keys()]),
  );
  const [questionIndex, setQuestionIndex] = useState(
    restoredState?.questionIndex ?? 0,
  );
  const [matchTimeLeft, setMatchTimeLeft] = useState(
    restoredState?.matchTimeLeft ?? MATCH_SECONDS,
  );
  const [timeLeft, setTimeLeft] = useState(
    restoredState?.timeLeft ?? QUESTION_SECONDS,
  );
  const [score, setScore] = useState(restoredState?.score ?? 0);
  const [goalCount, setGoalCount] = useState(restoredState?.goalCount ?? 0);
  const [answeredCount, setAnsweredCount] = useState(
    restoredState?.answeredCount ?? 0,
  );
  const [feedback, setFeedback] = useState(
    restoredState?.feedback ?? "Trả lời đúng để nhận lượt sút!",
  );
  const [feedbackType, setFeedbackType] = useState(
    restoredState?.feedbackType ?? "neutral",
  );
  const [goalkeeperPose, setGoalkeeperPose] = useState(
    restoredState?.goalkeeperPose ?? "stand",
  );
  const [keeperLean, setKeeperLean] = useState(restoredState?.keeperLean ?? "");
  const [ballFlight, setBallFlight] = useState(
    restoredState?.ballFlight ?? "idle",
  );
  const [ballStyle, setBallStyle] = useState({});
  const [shotPopup, setShotPopup] = useState({
    show: false,
    kind: "miss",
    title: "",
    points: 0,
  });
  const [selectedOption, setSelectedOption] = useState(
    restoredState?.selectedOption ?? null,
  );

  const finishGuardRef = useRef(restoredState?.phase === "finished");
  const popupTimerRef = useRef(null);
  const goalAreaRef = useRef(null);
  const shotTargetRef = useRef(null);
  const ballRef = useRef(null);

  const currentQuestion = useMemo(() => {
    const qIndex = questionOrder[questionIndex];
    return QUESTIONS[qIndex];
  }, [questionIndex, questionOrder]);

  const matchClock = useMemo(() => {
    const minutes = Math.floor(matchTimeLeft / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (matchTimeLeft % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [matchTimeLeft]);

  const keeperImage =
    goalkeeperPose === "left"
      ? keeperLean === "low-left"
        ? keeperLeftLowImg
        : keeperLeftImg
      : goalkeeperPose === "middle"
        ? keeperLean === "low-middle"
          ? keeperMiddleLowImg
          : keeperMiddleHighImg
        : goalkeeperPose === "right"
          ? keeperLean === "low-right"
            ? keeperRightLowImg
            : keeperRightImg
          : keeperStandImg;

  const resetRoundVisual = () => {
    setGoalkeeperPose("stand");
    setKeeperLean("");
    setBallFlight("idle");
    setBallStyle({});
    setShotPopup({ show: false, kind: "miss", title: "", points: 0 });
    setSelectedOption(null);
  };

  const showShotPopup = ({ kind, title, points }) => {
    if (popupTimerRef.current) {
      clearTimeout(popupTimerRef.current);
    }

    setShotPopup({ show: true, kind, title, points });

    popupTimerRef.current = setTimeout(() => {
      setShotPopup((prev) => ({ ...prev, show: false }));
      popupTimerRef.current = null;
    }, 1100);
  };

  const loadLeaderboard = async () => {
    if (!hasMockApiConfig()) {
      setLeaderboardError("Chưa cấu hình VITE_API_URL trong file .env.");
      setLeaderboardRows([]);
      return;
    }

    setIsLeaderboardLoading(true);
    setLeaderboardError("");

    try {
      const rows = await fetchMockLeaderboard();
      setLeaderboardRows(rows);
    } catch (error) {
      setLeaderboardRows([]);
      setLeaderboardError(
        error instanceof Error
          ? error.message
          : "Không tải được bảng xếp hạng từ MockAPI.",
      );
    } finally {
      setIsLeaderboardLoading(false);
    }
  };

  const resetToMenuState = () => {
    finishGuardRef.current = false;
    setPhase("menu");
    setShowGuidePopup(false);
    setShowNamePopup(false);
    setTurnState("answering");
    setInputName("");
    setPlayerName("");
    setQuestionOrder(shuffle([...QUESTIONS.keys()]));
    setQuestionIndex(0);
    setMatchTimeLeft(MATCH_SECONDS);
    setTimeLeft(QUESTION_SECONDS);
    setScore(0);
    setGoalCount(0);
    setAnsweredCount(0);
    setFeedback("Trả lời đúng để nhận lượt sút!");
    setFeedbackType("neutral");
    setGoalkeeperPose("stand");
    setKeeperLean("");
    setBallFlight("idle");
    setBallStyle({});
    setShotPopup({ show: false, kind: "miss", title: "", points: 0 });
    setSelectedOption(null);
  };

  useEffect(() => {
    const snapshot = {
      phase,
      showGuidePopup,
      showNamePopup,
      turnState,
      inputName,
      playerName,
      questionOrder,
      questionIndex,
      matchTimeLeft,
      timeLeft,
      score,
      goalCount,
      answeredCount,
      feedback,
      feedbackType,
      goalkeeperPose,
      keeperLean,
      ballFlight,
      selectedOption,
    };

    try {
      persistState(snapshot);
    } catch {
      // Ignore persistence failures (private mode, quota, etc.) and keep game running.
    }
  }, [
    phase,
    showGuidePopup,
    showNamePopup,
    turnState,
    inputName,
    playerName,
    questionOrder,
    questionIndex,
    matchTimeLeft,
    timeLeft,
    score,
    goalCount,
    answeredCount,
    feedback,
    feedbackType,
    goalkeeperPose,
    keeperLean,
    ballFlight,
    selectedOption,
  ]);

  const animateBallToClick = (clientX, clientY, outcome) => {
    const ballRect = ballRef.current?.getBoundingClientRect();
    const areaRect = goalAreaRef.current?.getBoundingClientRect();
    if (!ballRect || !areaRect) {
      setBallFlight(outcome);
      return;
    }

    const startX = ballRect.left + ballRect.width / 2;
    const startY = ballRect.top + ballRect.height / 2;
    const dx = clientX - startX;
    const dy = clientY - startY;
    const targetYRate = (clientY - areaRect.top) / areaRect.height;
    const scale = Math.max(0.3, Math.min(0.95, 1 - targetYRate * 0.75));
    const rotation = Math.max(-760, Math.min(760, dx * 1.6));

    setBallStyle({
      "--shot-dx": `${dx}px`,
      "--shot-dy": `${dy}px`,
      "--shot-scale": String(scale),
      "--shot-rot": `${rotation}deg`,
      "--shot-opacity": outcome === "goal" ? "1" : "0.32",
    });
    setBallFlight(outcome);
  };

  const queueNextQuestion = ({ nextScore, nextGoals, nextAnswered }) => {
    setTimeout(() => {
      if (finishGuardRef.current || phase !== "playing") {
        return;
      }

      const nextIndex = questionIndex + 1;
      if (nextIndex >= questionOrder.length) {
        setQuestionOrder(shuffle([...QUESTIONS.keys()]));
        setQuestionIndex(0);
      } else {
        setQuestionIndex(nextIndex);
      }
      setTimeLeft(QUESTION_SECONDS);
      setTurnState("answering");
      setFeedback("Câu tiếp theo! Trả lời đúng để nhận lượt sút.");
      setFeedbackType("neutral");
      resetRoundVisual();
    }, 1450);
  };

  const finishGame = ({
    finalScore = score,
    finalGoals = goalCount,
    finalAnswered = answeredCount,
  } = {}) => {
    if (finishGuardRef.current) {
      return;
    }
    finishGuardRef.current = true;
    setPhase("finished");
    setFeedback(
      `Kết thúc trận! ${playerName} ghi ${finalGoals} bàn, được ${finalScore} điểm trong ${finalAnswered} lượt.`,
    );

    if (playerName && hasMockApiConfig()) {
      submitMockScore({ name: playerName, score: finalScore }).catch(() => {});
    }
  };

  useEffect(() => {
    if (phase !== "leaderboard") {
      return;
    }

    loadLeaderboard();
  }, [phase]);

  useEffect(() => {
    if (!needsResolveRecoveryRef.current) {
      return;
    }

    needsResolveRecoveryRef.current = false;

    // If user refreshed while waiting for queueNextQuestion timeout,
    // the pending timeout is lost. Recover by moving to the next question.
    if (phase === "playing" && turnState === "resolving") {
      const nextIndex = questionIndex + 1;
      if (nextIndex >= questionOrder.length) {
        setQuestionOrder(shuffle([...QUESTIONS.keys()]));
        setQuestionIndex(0);
      } else {
        setQuestionIndex(nextIndex);
      }

      setTimeLeft(QUESTION_SECONDS);
      setTurnState("answering");
      setFeedback("Đã khôi phục phiên chơi. Tiếp tục với câu hỏi tiếp theo.");
      setFeedbackType("neutral");
      setGoalkeeperPose("stand");
      setKeeperLean("");
      setBallFlight("idle");
      setBallStyle({});
      setShotPopup({ show: false, kind: "miss", title: "", points: 0 });
      setSelectedOption(null);
    }
  }, [phase, turnState, questionIndex, questionOrder]);

  useEffect(() => {
    if (phase !== "playing" || turnState === "resolving" || showResumePrompt) {
      return undefined;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, turnState, showResumePrompt]);

  useEffect(() => {
    if (phase !== "playing" || showResumePrompt) {
      return undefined;
    }

    const timer = setInterval(() => {
      setMatchTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, showResumePrompt]);

  useEffect(() => {
    if (phase !== "playing" || matchTimeLeft > 0) {
      return;
    }

    finishGame();
  }, [phase, matchTimeLeft]);

  useEffect(() => {
    if (
      phase !== "playing" ||
      turnState === "resolving" ||
      timeLeft > 0 ||
      showResumePrompt
    ) {
      return;
    }

    const nextAnswered = answeredCount + 1;

    setTurnState("resolving");
    setAnsweredCount(nextAnswered);
    setFeedback(
      turnState === "aiming"
        ? "Hết giờ! Bạn chưa kịp sút nên mất lượt này."
        : "Hết 45 giây cho câu này! Bạn chưa trả lời đúng để nhận lượt sút.",
    );
    setFeedbackType("timeout");
    setGoalkeeperPose("stand");
    setKeeperLean("");
    setBallFlight("idle");
    setBallStyle({});

    queueNextQuestion({
      nextScore: score,
      nextGoals: goalCount,
      nextAnswered,
    });
  }, [
    phase,
    turnState,
    timeLeft,
    answeredCount,
    score,
    goalCount,
    showResumePrompt,
  ]);

  const handleStart = (event) => {
    event.preventDefault();
    const normalized = inputName.trim();
    if (!normalized) {
      return;
    }

    finishGuardRef.current = false;
    setShowGuidePopup(false);
    setShowNamePopup(false);
    setPlayerName(normalized);
    setQuestionOrder(shuffle([...QUESTIONS.keys()]));
    setQuestionIndex(0);
    setMatchTimeLeft(MATCH_SECONDS);
    setTurnState("answering");
    setTimeLeft(QUESTION_SECONDS);
    setScore(0);
    setGoalCount(0);
    setAnsweredCount(0);
    setFeedback("Trận đấu bắt đầu! Trả lời đúng để nhận lượt sút.");
    setFeedbackType("neutral");
    resetRoundVisual();
    setPhase("playing");
  };

  const handleAnswer = (option) => {
    if (phase !== "playing" || turnState !== "answering" || timeLeft <= 0) {
      return;
    }

    const isCorrect = option === currentQuestion.answer;
    setSelectedOption(option);

    if (isCorrect) {
      setFeedback("Chính xác! Bây giờ hãy click vào vị trí bạn muốn sút.");
      setFeedbackType("correct");
      setTurnState("aiming");
      setGoalkeeperPose("stand");
      setKeeperLean("");
      setBallFlight("idle");
      setBallStyle({});
    } else {
      const nextAnswered = answeredCount + 1;

      setTurnState("resolving");
      setAnsweredCount(nextAnswered);
      setFeedback("Sai rồi. Chuyển sang câu hỏi khác.");
      setFeedbackType("wrong");
      setGoalkeeperPose("stand");
      setKeeperLean("");
      setBallFlight("idle");
      setBallStyle({});

      queueNextQuestion({
        nextScore: score,
        nextGoals: goalCount,
        nextAnswered,
      });
    }
  };

  const handleShot = (event) => {
    if (phase !== "playing" || turnState !== "aiming" || timeLeft <= 0) {
      return;
    }

    const goalRect = shotTargetRef.current?.getBoundingClientRect();
    if (!goalRect) {
      return;
    }

    const shotX = event.clientX - goalRect.left;
    const leftBoundary = goalRect.width / 3;
    const rightBoundary = (goalRect.width * 2) / 3;
    const shotSide =
      shotX < leftBoundary
        ? "left"
        : shotX > rightBoundary
          ? "right"
          : "middle";
    const isLowShot = event.clientY > goalRect.top + goalRect.height * 0.62;
    const nextAnswered = answeredCount + 1;

    setTurnState("resolving");
    setAnsweredCount(nextAnswered);

    const isInsideGoal =
      event.clientX >= goalRect.left &&
      event.clientX <= goalRect.right &&
      event.clientY >= goalRect.top &&
      event.clientY <= goalRect.bottom;

    if (!isInsideGoal) {
      setGoalkeeperPose("stand");
      setKeeperLean("");
      animateBallToClick(event.clientX, event.clientY, "miss");
      setFeedback("Bóng đi ra ngoài khung thành nên cú sút không thành công.");
      setFeedbackType("wrong");
      showShotPopup({ kind: "miss", title: "TRƯỢT", points: 0 });
      queueNextQuestion({
        nextScore: score,
        nextGoals: goalCount,
        nextAnswered,
      });
      return;
    }

    const keeperDive =
      KEEPER_ZONES[Math.floor(Math.random() * KEEPER_ZONES.length)];
    const isSaved = keeperDive === shotSide;

    setGoalkeeperPose(keeperDive);
    setKeeperLean(isLowShot ? `low-${keeperDive}` : "");

    if (isSaved) {
      animateBallToClick(event.clientX, event.clientY, "miss");
      setFeedback("Thủ môn đoán đúng hướng và đã cản phá cú sút.");
      setFeedbackType("wrong");
      showShotPopup({ kind: "miss", title: "TRƯỢT", points: 0 });
      queueNextQuestion({
        nextScore: score,
        nextGoals: goalCount,
        nextAnswered,
      });
      return;
    }

    const speedRate = Math.max(0, timeLeft / QUESTION_SECONDS);
    const earned = Math.round(80 + speedRate * 100);
    const nextScore = score + earned;
    const nextGoals = goalCount + 1;

    setScore(nextScore);
    setGoalCount(nextGoals);
    animateBallToClick(event.clientX, event.clientY, "goal");
    setFeedback(`GOAL! +${earned} điểm.`);
    setFeedbackType("correct");
    showShotPopup({ kind: "goal", title: "VÀO", points: earned });

    queueNextQuestion({ nextScore, nextGoals, nextAnswered });
  };

  useEffect(() => {
    return () => {
      if (popupTimerRef.current) {
        clearTimeout(popupTimerRef.current);
      }
    };
  }, []);

  const playAgainSamePlayer = () => {
    if (!playerName) {
      return;
    }
    setInputName(playerName);
    const fakeEvent = { preventDefault() {} };
    handleStart(fakeEvent);
  };

  const switchPlayer = () => {
    setPhase("menu");
    setShowResumePrompt(false);
    setShowGuidePopup(false);
    setShowNamePopup(false);
    setTurnState("answering");
    setQuestionIndex(0);
    setMatchTimeLeft(MATCH_SECONDS);
    setTimeLeft(QUESTION_SECONDS);
    setFeedback("Trả lời đúng để nhận lượt sút!");
    setFeedbackType("neutral");
    resetRoundVisual();
  };

  return (
    <main className="game-shell">
      <section className="stadium-panel">
        <img
          className="stadium-bg"
          src={fieldBgImg}
          alt="Soccer goal background"
        />

        {phase === "menu" ? (
          <section className="menu-screen">
            <h1>Penalty Quiz Challenge</h1>
            <p>Trả lời câu hỏi để lấy lượt sút và ghi bàn trong 7 phút.</p>
            <div className="menu-actions menu-main-actions">
              <button
                type="button"
                className="action-play"
                onClick={() => setShowNamePopup(true)}
              >
                Chơi
              </button>
              <button
                type="button"
                className="action-leaderboard"
                onClick={() => {
                  setShowGuidePopup(false);
                  setShowNamePopup(false);
                  setPhase("leaderboard");
                }}
              >
                Bảng xếp hạng
              </button>
              <button
                type="button"
                className="action-guide"
                onClick={() => setShowGuidePopup(true)}
              >
                Hướng dẫn chơi
              </button>
            </div>

            {showGuidePopup && (
              <div className="menu-popup-backdrop">
                <div
                  className="menu-popup guide-card"
                  role="dialog"
                  aria-modal="true"
                >
                  <h2>Hướng dẫn chơi</h2>
                  <p>1. Nhấn Chơi và nhập tên người chơi.</p>
                  <p>2. Mỗi câu hỏi có 45 giây, hết giờ sẽ tự qua câu mới.</p>
                  <p>3. Trả lời đúng để mở lượt sút và click điểm muốn sút.</p>
                  <p>
                    4. Bóng ra ngoài hoặc thủ môn đoán đúng hướng thì trượt.
                  </p>
                  <div className="popup-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowGuidePopup(false)}
                    >
                      Quay lại menu
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showNamePopup && (
              <div className="menu-popup-backdrop">
                <form className="menu-popup name-form" onSubmit={handleStart}>
                  <h2>Nhập tên người chơi</h2>
                  <label htmlFor="playerNamePopup">Tên người chơi</label>
                  <input
                    id="playerNamePopup"
                    type="text"
                    maxLength={24}
                    value={inputName}
                    onChange={(event) => setInputName(event.target.value)}
                    placeholder="Ví dụ: Hoang"
                    required
                    autoFocus
                  />
                  <div className="popup-actions">
                    <button type="submit">Bắt đầu trận đấu</button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowNamePopup(false)}
                    >
                      Quay lại menu
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
        ) : phase === "leaderboard" ? (
          <section className="menu-screen leaderboard-screen">
            <h1>Bảng xếp hạng</h1>
            {isLeaderboardLoading && <p>Đang tải dữ liệu...</p>}
            {leaderboardError && (
              <p className="leaderboard-error">{leaderboardError}</p>
            )}
            {!isLeaderboardLoading && !leaderboardError && (
              <ol className="leaderboard-list">
                {leaderboardRows.length === 0 && (
                  <li className="leaderboard-empty">Chưa có dữ liệu.</li>
                )}
                {leaderboardRows.map((row, idx) => (
                  <li
                    key={`${row.id}-${idx}`}
                    className={`leaderboard-item ${
                      idx < 5 ? `top-${idx + 1}` : ""
                    }`}
                  >
                    <span className="rank">#{idx + 1}</span>
                    <span className="name">{row.name}</span>
                    <strong className="points">{row.score}</strong>
                  </li>
                ))}
              </ol>
            )}
            <div className="menu-actions">
              <button type="button" onClick={loadLeaderboard}>
                Tải lại
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setPhase("menu")}
              >
                Quay lại
              </button>
            </div>
          </section>
        ) : (
          <>
            {showResumePrompt && (
              <div className="menu-popup-backdrop">
                <div
                  className="menu-popup guide-card"
                  role="dialog"
                  aria-modal="true"
                >
                  <h2>Khôi phục phiên chơi</h2>
                  <p>Bạn vừa tải lại trang khi trận đang diễn ra.</p>
                  <p>Bạn muốn tiếp tục hay quay về menu?</p>
                  <div className="popup-actions">
                    <button
                      type="button"
                      onClick={() => setShowResumePrompt(false)}
                    >
                      Tiếp tục
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        clearPersistedState();
                        setShowResumePrompt(false);
                        resetToMenuState();
                      }}
                    >
                      Quay về menu
                    </button>
                  </div>
                </div>
              </div>
            )}

            <header className="hud">
              <div className="hud-item">
                <span className="hud-label">Player</span>
                <strong>{playerName || "---"}</strong>
              </div>
              <div className="hud-item">
                <span className="hud-label">Score</span>
                <strong>{score}</strong>
              </div>
              <div className="hud-item">
                <span className="hud-label">Match</span>
                <strong>{matchClock}</strong>
              </div>
            </header>

            <div className="question-banner">
              {phase === "playing"
                ? currentQuestion.question
                : "Penalty Quiz Challenge - Trả lời đúng để sút vào lưới!"}
              {phase === "playing" && (
                <span className="question-timer">Câu này: {timeLeft}s</span>
              )}
            </div>

            <div
              className={`goal-area ${turnState === "aiming" ? "aiming" : ""}`}
              ref={goalAreaRef}
              onClick={handleShot}
            >
              {turnState === "aiming" && (
                <>
                  <div className="shot-target-box" ref={shotTargetRef} />
                  <div className="shot-help">
                    Chọn điểm sút bất kỳ. Ngoài khung thành sẽ tự động trượt.
                  </div>
                </>
              )}
              <img
                className={`keeper ${goalkeeperPose} ${keeperLean}`}
                src={keeperImage}
                alt="Goalkeeper"
              />
              <img
                className={`ball ${ballFlight}`}
                src={ballImg}
                alt="Soccer ball"
                ref={ballRef}
                style={ballStyle}
              />

              {shotPopup.show && (
                <div className={`shot-popup ${shotPopup.kind}`} role="status">
                  <strong>{shotPopup.title}</strong>
                  <span>+{shotPopup.points} điểm</span>
                </div>
              )}
            </div>

            <p className={`feedback ${feedbackType}`}>
              {feedbackType === "correct" && (
                <span className="feedback-badge">Đúng</span>
              )}
              {feedbackType === "wrong" && (
                <span className="feedback-badge">Sai</span>
              )}
              {feedbackType === "timeout" && (
                <span className="feedback-badge">Hết giờ</span>
              )}
              {feedback}
              {feedbackType === "timeout" && phase === "playing" && (
                <span className="answer-hint">
                  {" "}
                  Đáp án đúng: {currentQuestion.answer}
                </span>
              )}
            </p>
          </>
        )}

        {phase === "playing" && (
          <section className="answers-grid">
            {currentQuestion.options.map((option, idx) => (
              <button
                key={`${option}-${idx}`}
                type="button"
                className={`answer-btn ${
                  turnState !== "answering" && option === currentQuestion.answer
                    ? "correct"
                    : selectedOption === option &&
                        option !== currentQuestion.answer
                      ? "wrong"
                      : selectedOption === option
                        ? "selected"
                        : ""
                }`}
                onClick={() => handleAnswer(option)}
                disabled={turnState !== "answering" || timeLeft <= 0}
              >
                <span className="answer-label">{ANSWER_LABELS[idx]}</span>
                <span>{option}</span>
              </button>
            ))}
          </section>
        )}

        {phase === "finished" && (
          <div className="result-card">
            <h2>Kết thúc trận đấu</h2>
            <p>
              {playerName} ghi được <strong>{score}</strong> điểm.
            </p>
            <p>
              Ghi bàn <strong>{goalCount}</strong> / {answeredCount} lượt sút.
            </p>
            <div className="result-actions">
              <button type="button" onClick={playAgainSamePlayer}>
                Chơi lại
              </button>
              <button type="button" className="ghost" onClick={switchPlayer}>
                Đổi người chơi
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
