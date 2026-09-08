# 弹雨漫游 · Bullet Rain Roam

纯前端网页游戏，无需构建，直接用浏览器打开 `index.html` 即可运行。

## 目录结构

```
bullet-rain-roam/
├── index.html          # 唯一页面：HUD、各弹层与脚本加载顺序
├── img.png             # 站点图标
├── css/
│   └── style.css       # 全部样式
└── js/                 # 按依赖顺序加载（见 index.html 底部）
    ├── audio.js        # WebAudio 合成音效
    ├── utils.js        # 通用工具 U（数学/随机/绘图/存储）
    ├── balance.js      # 数值曲线 BAL
    ├── input.js        # 键鼠与移动端轮盘输入
    ├── fx.js           # 粒子/光环/电弧/飘字特效
    ├── telegraph.js    # 预警区域（扇形/直线/圆形）
    ├── forms.js        # 弹道形态 FORMS
    ├── effects.js      # 状态效果（冰霜/剧毒/麻痹）
    ├── enemies.js      # 敌人与首领
    ├── weapons.js      # 弹珠定义与弹道系统
    ├── weapons2.js     # A/S 阶弹珠
    ├── fusions.js      # 合成规则与配方
    ├── abilities.js    # S 阶专属技能
    ├── upgrades.js     # 升级事件与被动
    ├── player.js       # 玩家
    ├── saves.js        # 本地存档
    └── game.js         # 主循环与界面逻辑
```

## 操作

WASD / 方向键移动，鼠标左键按住朝指针移动，移动端拖动屏幕下方轮盘；
SPACE / Q / E 释放技能，R 释放祝福技能，ESC / P 暂停，M 开关音效。

## 本地存档

存档保存在浏览器 localStorage 中，最多 10 条。
