import React, { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    const [list, notes] = await Promise.all([
      v2<any[]>("/v2/projects"),
      v2<any[]>("/v2/notifications"),
    ]);
    setProjects(list);
    setNotifications(notes);
    if (project?.id) {
      const fresh = await v2<any>(`/v2/projects/${project.id}`);
      setProject(fresh);
    }
  }, [project?.id]);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);

  const openProject = async (id: string) => {
    const fresh = await v2<any>(`/v2/projects/${id}`);
    setProject(fresh);
    setView("project");
  };

  const onCreated = (projectId: string, runId: string) => {
    openProject(projectId).catch(() => undefined);
    const stop = subscribeRun(runId, (event, data) => {
      if (event === "state") setRun((current: any) => ({ ...(current || {}), ...data, id: runId }));
      if (event === "done") {
        stop();
        openProject(projectId).catch(() => undefined);
      }
    });
  };

  const openEvidence = async (id: string) => {
    const item = await v2(`/v2/evidence/${id}`);
    setEvidence(item);
    setDrawer(true);
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
          onOpenProject={openProject}
          onCreated={onCreated}
          onRefresh={refresh}
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
