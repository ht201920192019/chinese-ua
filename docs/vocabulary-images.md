# 词汇图片

使用内置 image_gen 生成 20 张统一水彩插画，仅覆盖具体事物和人物。数字、问候和抽象词不配图。

| 分类 | 目录（相对项目根目录） | 数量 |
| --- | --- | --- |
| 家庭 | public/images/vocabulary/family/ | 6 |
| 食物 | public/images/vocabulary/food/ | 5 |
| 交通 | public/images/vocabulary/transport/ | 4 |
| 工作与学习 | public/images/vocabulary/work/ | 5 |

网站使用 1254 × 1254 WebP，20 张合计约 2.54 MiB。PNG 原图保存在 `assets/imagegen-originals/`，生成工具默认保存的原始文件也保留。

`src/vocabulary-images.json` 记录词条、网站路径和乌克兰语替代文本，由 `src/site-data.cjs` 加载。已有显式图片绑定优先保留。

`docs/image-generation.json` 保存逐图完整生成提示词。提示词中的 name 是文件名主体；线上文件扩展名为 `.webp`，归档原图为 `.png`。格式导出脚本为 `scripts/export-vocabulary-images.py`，导出不改变图片内容或尺寸。

修改图片映射后运行 `npm run build`。浏览器检查使用 `npm test`。
