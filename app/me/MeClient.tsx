"use client";

export default function MeClient() {
  async function logout() {
    await fetch("/api/users/logout", { method: "POST" });
    window.location.href = "/";
  }
  return (
    <button
      onClick={logout}
      className="px-4 py-2 rounded-full bg-white text-rose-500 shadow-card hover:shadow-lg self-start"
    >
      登出
    </button>
  );
}
