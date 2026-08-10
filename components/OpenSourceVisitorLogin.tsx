"use client";

import { useRef, useState } from "react";
import AnimatedCharacters from "./opensource-login/AnimatedCharacters";
import LoginForm from "./opensource-login/LoginForm";

type VisitorIdentity = { name: string; avatar: string };

export default function OpenSourceVisitorLogin({
  initialData,
  onLoginSuccess,
  onBrowse,
}: {
  initialData?: VisitorIdentity | null;
  onLoginSuccess: (identity: VisitorIdentity) => void | Promise<void>;
  onBrowse: () => void;
}) {
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isNodding, setIsNodding] = useState(false);
  const [loginState, setLoginState] = useState("idle");
  const [isLeaving, setIsLeaving] = useState(false);
  const leavingRef = useRef(false);

  const leaveSmoothly = (next: () => void) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setIsLeaving(true);
    window.setTimeout(next, 620);
  };

  return (
    <div className={`ix-os-login-modal${isLeaving ? " is-leaving" : ""}`} role="dialog" aria-modal="true" aria-label="校园访客登录" aria-busy={isLeaving}>
      <div className="ix-os-login-panel">
        <div className="ix-os-login-characters" aria-hidden="true">
          <AnimatedCharacters
            isPasswordFocused={false}
            isEmailFocused={isEmailFocused}
            showPassword={false}
            isTyping={isTyping}
            isNodding={isNodding}
            loginState={loginState}
          />
        </div>
        <div className="ix-os-login-form">
          <LoginForm
            initialData={initialData}
            onPasswordFocusChange={() => undefined}
            onShowPasswordChange={() => undefined}
            onEmailFocusChange={setIsEmailFocused}
            onTypingChange={setIsTyping}
            onNoddingChange={setIsNodding}
            onLoginStateChange={setLoginState}
            onLoginSuccess={(identity: VisitorIdentity) => leaveSmoothly(() => { void onLoginSuccess(identity); })}
            onBrowse={() => leaveSmoothly(onBrowse)}
          />
        </div>
      </div>
    </div>
  );
}
