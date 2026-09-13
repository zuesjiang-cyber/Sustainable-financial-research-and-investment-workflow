import React from "react";
import { ShieldAlert } from "lucide-react";
import type { PhilosophyDemo } from "./types";
import { Drawer } from "./Drawer";

/**
 * The three design principles, for whoever is evaluating the product rather
 * than using it.
 *
 * This is deliberately not on the desk. An analyst reopening the project wants
 * to know what changed, not to be taught the architecture — so the principles
 * are demonstrated by the interface and documented behind one entry. Each note
 * says where to look, which keeps it verifiable instead of decorative.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  demo: PhilosophyDemo;
}

export const DesignNotesDrawer: React.FC<Props> = ({ open, onClose, demo }) => (
  <Drawer open={open} onClose={onClose} title="设计说明" sub="三条原则 · 以及在这个界面里如何验证">
    {demo.pillars.map((p) => (
      <section className="rd-pillar" key={p.id}>
        <div className="rd-pillar-n">{p.index}</div>
        <h3>{p.title}</h3>
        <p>{p.claim}</p>
        <p className="rd-pillar-where">
          <b>在这个界面里：</b>
          {p.howItShows}
        </p>
        <p className="rd-pillar-where">
          <b>反例：</b>
          {p.antiPattern}
        </p>
      </section>
    ))}

    <section className="rd-pillar">
      <div className="rd-pillar-n">—</div>
      <h3>演示与真实管线的隔离</h3>
      <p>
        本界面所有数据来自 <code>src/demo/</code> 下的静态合成装置。该目录不导入任何服务端模块、不发起网络请求、
        不创建项目、不写入 Research Memory；真实管线也不导入本目录。
      </p>
      <p className="rd-pillar-where">
        <b>如何保证：</b>
        隔离是结构性的，不依赖约定注释。<code>tests/demo-isolation.test.ts</code> 把每一条约束写成会失败的断言，
        任何人把演示接进真实管线、或给演示加上网络与存储访问，构建即失败。
      </p>
    </section>

    <div className="rd-synthetic">
      <ShieldAlert />
      <span>{demo.meta.dataNote}</span>
    </div>
  </Drawer>
);
