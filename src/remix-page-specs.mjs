export const REMIX_PAGE_SPECS = Object.freeze([
  {
    number: 1,
    route: "remixStep1",
    title: "链接下载与素材提取",
    subtitle: "下载参考片并提取 24 FPS 全帧、原音频和帧索引",
    inputs: ["抖音链接或本地视频", "模板使用权", "男女主身份照片"],
    actions: ["下载原片", "提取 24 FPS 全帧", "提取原音频"],
    outputs: ["原片", "帧索引", "WAV 音频"],
    checks: ["授权已确认", "时长和帧数正确", "音频可播放"]
  },
  {
    number: 2,
    route: "remixStep2",
    title: "画面、音频、字幕与提示词解析",
    subtitle: "生成逐镜画面、声音、字幕和替换提示词结构",
    inputs: ["帧索引", "原始音频", "镜头切点"],
    actions: ["生成结构报告", "提取字幕", "生成音频、图片和视频提示词"],
    outputs: ["逐镜报告", "SRT", "三类提示词"],
    checks: ["时间码连续", "角色映射明确", "提示词字段完整"]
  },
  {
    number: 3,
    route: "remixStep3",
    title: "男女主角色图批量生成",
    subtitle: "以真实照片为身份锚点生成多镜头候选",
    inputs: ["男女主身份母版", "分析报告", "批量数量"],
    actions: ["选择 12/24/36/48 张", "确认费用", "生成或上传候选"],
    outputs: ["角色图候选", "选版记录"],
    checks: ["身份一致", "服装和时代正确", "候选数量正确"]
  },
  {
    number: 4,
    route: "remixStep4",
    title: "人物与道具逐镜替换",
    subtitle: "明确人物和道具映射，生成或导入替换镜头",
    inputs: ["角色图候选", "替换映射", "道具参考"],
    actions: ["绑定图一、图二或人物编号", "生成或导入视频", "逐镜九项质检"],
    outputs: ["最终片段", "提示词版本", "审核记录"],
    checks: ["无串脸", "手部和道具正确", "背景稳定"]
  },
  {
    number: 5,
    route: "remixStep5",
    title: "原轨道对齐、预览与交付",
    subtitle: "让替换镜头重新对齐原音乐、字幕和 24 FPS 时间轴",
    inputs: ["已批准镜头", "原音频", "原字幕", "时间轴"],
    actions: ["封装当前时间轴", "检查音画同步", "导出交付包"],
    outputs: ["预览 MP4", "SRT", "交付清单"],
    checks: ["无缺口和重叠", "字幕同步", "完整观看通过"]
  }
]);
