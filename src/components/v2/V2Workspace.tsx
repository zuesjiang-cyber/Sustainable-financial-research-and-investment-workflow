import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Clapperboard, Home, Settings, ShieldCheck } from "lucide-react";
import { ResearchHome } from "./ResearchHome";
import { CompanyResearchPage } from "./CompanyResearchPage";
import { SettingsPage } from "./SettingsPage";
import { ReplayPage } from "./ReplayPage";
import { EvidenceSidebar } from "./EvidenceSidebar";
import { ReportFirstContainer } from "../research/ReportFirstContainer";
import { subscribeRun, v2 } from "./api";

type View = "home" | "project" | "settings" | "replay" | "v1";

export const V2Workspace: React.FC = () => {
  const [view, setView] = useState<View>("home");
  const [projects, setProjects] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [project, setProject] = useState<any | null>(null);
  const [run, setRun] = useState<any | null>(null);
  const [evidence, setEvidence] = useState<any | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [health, setHealth] = useState<any | null>(null);
  const knownNotes = useRef(new Set<string>());
  const stopRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    const [list, notes, status] = await Promise.all([
      v2<any[]>("/v2/projects"),
      v2<any[]>("/v2/notifications"),
      v2<any>("/v2/health").catch(() => null),
    ]);
    setProjects(list);
    setNotifications(notes);
    setHealth(status);
    if (project?.id) {
      const fresh = await v2<any>(`/v2/projects/${project.id}`);
      setProject(fresh);
    }
    for (const note of notes) {
      if (note.readAt || knownNotes.current.has(note.id)) continue;
      knownNotes.current.add(note.id);
      const watching = Boolean(freshBrowserNotify(project) || list.find((item) => item.id === note.projectId)?.monitoring);
      if (watching && note.importance === "HIGH" && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(note.title, { body: note.body });
      }
    }
  }, [project?.id]);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => { refresh().catch(() => undefined); }, 12_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const listen = (projectId: string, runId: string) => {
    stopRef.current?.();
    stopRef.current = subscribeRun(runId, (event, data) => {
      if (event === "state") setRun((current: any) => ({ ...(current || {}), ...data, id: runId }));
      if (event === "progress") setRun((current: any) => {
        const events = [...(current?.events || [])];
        if (data?.seq && !events.some((item: any) => item.seq === data.seq)) events.push(data);
        return { ...(current || {}), id: runId, events };
      });
      if (event === "done") {
        stopRef.current?.();
        openProject(projectId).catch(() => undefined);
      }
    });
  };

  const openProject = async (id: string) => {
    const fresh = await v2<any>(`/v2/projects/${id}`);
    setProject(fresh);
    setView("project");
    const active = (fresh.runs || []).find((item: any) => item.status === "RUNNING" || item.status === "PARTIAL" || item.status === "QUEUED");
    if (active) {
      setRun(active);
      if (active.status === "RUNNING" || active.status === "QUEUED" || active.status === "PARTIAL") listen(id, active.id);
    }
  };

  const onCreated = (projectId: string, runId: string) => {
    openProject(projectId).catch(() => undefined);
    listen(projectId, runId);
  };

  const openEvidence = async (id: string) => {
    const item = await v2(`/v2/evidence/${id}`);
    setEvidence(item);
    setDrawer(true);
  };

  const onOpenNotification = async (item: any) => {
    if (item.projectId) await openProject(item.projectId);
    if (item.eventIds?.[0]) {
      const projectFresh = await v2<any>(`/v2/projects/${item.projectId}`);
      const event = projectFresh.events?.find((row: any) => row.id === item.eventIds[0]);
      if (event?.evidenceIds?.[0]) await openEvidence(event.evidenceIds[0]);
    }
  };

  return (
    <div className="v2-shell">
      <nav className="v2-nav">
        <button type="button" className={view === "home" ? "is-active" : ""} onClick={() => setView("home")}><Home className="h-4 w-4" /> 研究</button>
        <button type="button" className={view === "replay" ? "is-active" : ""} onClick={() => setView("replay")}><Clapperboard className="h-4 w-4" /> 回放</button>
        <button type="button" className={view === "v1" ? "is-active" : ""} onClick={() => setView("v1")}><ShieldCheck className="h-4 w-4" /> 研报核验</button>
        <button type="button" className={view === "settings" ? "is-active" : ""} onClick={() => setView("settings")}><Settings className="h-4 w-4" /> 设置</button>
        <span className="v2-nav-bell"><Bell className="h-4 w-4" /> {notifications.filter((item) => !item.readAt).length}</span>
      </nav>
      {view === "home" && (
        <ResearchHome
          projects={projects}
          notifications={notifications}
          health={health}
          onOpenProject={openProject}
          onCreated={onCreated}
          onRefresh={refresh}
          onOpenNotification={onOpenNotification}
        />
      )}
      {view === "project" && project && (
        <CompanyResearchPage project={project} run={run} onBack={() => setView("home")} onOpenEvidence={openEvidence} onRefresh={() => openProject(project.id)} />
      )}
      {view === "settings" && <SettingsPage />}
      {view === "replay" && <ReplayPage onOpen={openProject} />}
      {view === "v1" && (
        <div className="v2-legacy">
          <div className="inline-alert is-info">旧研报核验入口仅用于历史查看与独立演示，不再写入旧状态结构。</div>
          <ReportFirstContainer />
        </div>
      )}
      <EvidenceSidebar open={drawer} evidence={evidence} onClose={() => setDrawer(false)} />
    </div>
  );
};

function freshBrowserNotify(project: any | null): boolean {
  return Boolean(project?.monitoring?.browserNotify);
}
