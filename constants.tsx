import { Phase, Status } from './types';
import { LayoutDashboard, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export const STATUS_CONFIG = {
  [Status.PENDING]: {
    label: '待开始',
    color: 'bg-slate-200 text-slate-500 border-slate-300',
    icon: <Clock size={14} />,
    next: Status.IN_PROGRESS
  },
  [Status.IN_PROGRESS]: {
    label: '进行中',
    color: 'bg-yellow-50 text-yellow-700 border-yellow-400 ring-1 ring-yellow-400/30',
    icon: <LayoutDashboard size={14} />,
    next: Status.COMPLETED
  },
  [Status.COMPLETED]: {
    label: '已完成',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-500 ring-1 ring-emerald-500/30',
    icon: <CheckCircle2 size={14} />,
    next: Status.RISK
  },
  [Status.RISK]: {
    label: '风险/滞后',
    color: 'bg-red-50 text-red-700 border-red-400 ring-1 ring-red-400/30',
    icon: <AlertCircle size={14} />,
    next: Status.PENDING
  }
};

export const INITIAL_DATA: Phase[] = [
  {
    id: 'phase-1',
    title: '前期准备',
    dateRange: '2025年10月 - 2026年1月',
    mainTasks: [
       {
        id: 'mt-1',
        title: '赛事公司及总体方案统筹',
        dateRange: '2026年1月31日前',
        subTasks: [
          { id: 'st-1-1', description: '监督管理公司运营：核准赛事总体方案、把控关键节点、监督日常运营纪律、统筹整体进度、对接主办单位', owner: '办赛执行/马丹/刘兵', deadline: '2025.12.10', status: Status.COMPLETED },
          { id: 'st-1-2', description: '确立大赛主题及总体工作方案', owner: '办赛执行/周海/李争', deadline: '2025.12.10', status: Status.COMPLETED },
          { id: 'st-1-3', description: '承办方案：制定承办、承办单位申报办法及标准、签订合作协议', owner: '办赛执行/马丹/刘兵', deadline: '2026.02.27', status: Status.IN_PROGRESS },
        ]
      },
      {
        id: 'mt-2',
        title: '赛事组织架构与运行机制建立',
        dateRange: '2025年12月31日前',
        subTasks: [
          { id: 'st-2-1', description: '组建分工：明确主办、承办、协办单位及各具体执行分工', owner: '办公室/朱光祖', deadline: '2025.12.10', status: Status.COMPLETED },
          { id: 'st-2-2', description: '组委会组建：拟定组委会名单并报批，设立各职能工作组', owner: '办公室/朱光祖', deadline: '2025.12.10', status: Status.COMPLETED },
        ]
      }
    ]
  },
  {
    id: 'phase-2',
    title: '赛道与规则体系构建',
    dateRange: '2026年1月 - 3月',
    mainTasks: [
      {
        id: 'mt-2-1',
        title: '赛道方向与技术路线论证',
        dateRange: '2026年1月31日前',
        subTasks: [
          { id: 'st-2-1-1', description: '明确赛题：构建具有实战价值的医疗影像AI赛题', owner: '专家工作组/梁晓明', deadline: '2026.02.15', status: Status.PENDING },
          { id: 'st-2-1-2', description: '标准构建：明确各类赛题的评分标准、数据规范及技术指标体系', owner: '专家工作组/梁晓明', deadline: '2025.12.10', status: Status.COMPLETED },
        ]
      },
      {
        id: 'mt-2-2',
        title: '竞赛规则设计体系构建',
        dateRange: '2026年2月15日前',
        subTasks: [
           { id: 'st-2-2-1', description: '专家复核：设立专家委员会对所有赛题及评分标准进行体系复审', owner: '专家工作组/梁晓明', deadline: '2026.02.27', status: Status.PENDING },
        ]
      }
    ]
  },
  {
    id: 'phase-3',
    title: '平台系统与数据资源准备',
    dateRange: '2026年1月 - 5月',
    mainTasks: [
      {
        id: 'mt-3-1',
        title: '竞赛平台建设与功能实现',
        dateRange: '2026年2月15日前',
        subTasks: [
           { id: 'st-3-1-1', description: '官网搭建：建设赛事官方网站', owner: '技术保障组/李平理', deadline: '2026.02.15', status: Status.IN_PROGRESS },
           { id: 'st-3-1-2', description: '系统集成：集成各方赛道系统与基础框架', owner: '技术保障组/李平理', deadline: '2026.02.15', status: Status.PENDING },
        ]
      },
      {
        id: 'mt-3-2',
        title: '数据资源整理与数据集构建',
        dateRange: '2026年4月30日前',
        subTasks: [
           { id: 'st-3-2-1', description: '数据汇集：汇集各类医学影像数据及标注信息', owner: '数据收集组/赵海涛', deadline: '2026.2.15', status: Status.IN_PROGRESS },
        ]
      }
    ]
  },
  {
    id: 'phase-4',
    title: '赛事启动与对外发布',
    dateRange: '2026年3月 - 6月',
    mainTasks: [
       {
          id: 'mt-4-1',
          title: '启动发布会',
          dateRange: '2026年2月28日前',
          subTasks: [
              { id: 'st-4-1-1', description: '大型发布方案：制定个性化、主理人计划及全球发布会、视频发布口径', owner: '宣传工作组/侯迪', deadline: '2026.02.29', status: Status.PENDING },
          ]
      }
    ]
  },
  {
    id: 'phase-5',
    title: '初赛',
    dateRange: '2026年6月 - 7月',
    mainTasks: [
       {
          id: 'mt-5-1',
          title: '初赛组织与评审',
          dateRange: '2026年7月',
          subTasks: [
              { id: 'st-5-1-1', description: '初赛作品提交与自动化测评', owner: '赛事运行组/马丹', deadline: '2026.07.15', status: Status.PENDING },
          ]
      }
    ]
  },
  {
    id: 'phase-6',
    title: '复赛',
    dateRange: '2026年8月 - 9月',
    mainTasks: [
       {
          id: 'mt-6-1',
          title: '复赛组织',
          dateRange: '2026年9月',
          subTasks: [
              { id: 'st-6-1-1', description: '复赛现场答辩与技术验证', owner: '专家工作组/梁晓明', deadline: '2026.09.20', status: Status.PENDING },
          ]
      }
    ]
  },
  {
    id: 'phase-7',
    title: '决赛颁奖典礼',
    dateRange: '2026年10月',
    mainTasks: [
       {
          id: 'mt-7-1',
          title: '总决赛暨颁奖典礼',
          dateRange: '2026年10月',
          subTasks: [
              { id: 'st-7-1-1', description: '总决赛评审会', owner: '组委会/朱光祖', deadline: '2026.10.15', status: Status.PENDING },
              { id: 'st-7-1-2', description: '颁奖盛典策划与执行', owner: '宣传工作组/侯迪', deadline: '2026.10.16', status: Status.PENDING },
          ]
      }
    ]
  },
  {
    id: 'phase-8',
    title: '赛后成果转化',
    dateRange: '2026年11月 - 12月',
    mainTasks: [
       {
          id: 'mt-8-1',
          title: '成果落地与孵化',
          dateRange: '2026年12月',
          subTasks: [
              { id: 'st-8-1-1', description: '优秀项目投融资对接会', owner: '外联工作组/何建军', deadline: '2026.11.30', status: Status.PENDING },
              { id: 'st-8-1-2', description: '医保应用场景落地签约', owner: '办赛执行/马丹', deadline: '2026.12.31', status: Status.PENDING },
          ]
      }
    ]
  }
];