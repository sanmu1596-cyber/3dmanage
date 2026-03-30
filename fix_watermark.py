"""
擦除 bg.png "2022" 水印 — V12
椭圆区域内所有像素强制统一为每行的均值索引
不区分水印和非水印——整个区域变成纯色渐变
"""
from PIL import Image
import numpy as np
import shutil, os

bak = r'c:\Users\joesyang\WorkBuddy\20260324104822\project-management\public\bg_backup.png'
dst = r'c:\Users\joesyang\WorkBuddy\20260324104822\project-management\public\bg.png'

shutil.copy2(bak, dst)
img = Image.open(dst)
raw = np.array(img)
pal = np.array(img.getpalette()).reshape(-1, 3)
h, w = raw.shape

# 椭圆参数 (从pixel map精确确认)
cx, cy = 1172.0, 53.0
rx, ry = 97.0, 23.0

# 对椭圆内所有像素，强制设为该行左侧(x:200-600, 远离水印)的中位数索引
count = 0
for y in range(int(cy - ry - 8), int(cy + ry + 8)):
    if y < 0 or y >= h:
        continue
    
    # 该行远处的参考索引（取中位数）
    far_left = raw[y, 200:600]
    ref_idx = int(np.median(far_left))
    
    for x in range(int(cx - rx - 8), min(int(cx + rx + 8), w)):
        if x < 0:
            continue
        
        # 椭圆内判定（含渐变边缘）
        dy = (y - cy) / ry
        dx = (x - cx) / rx
        dist = np.sqrt(dy*dy + dx*dx)
        
        if dist > 1.3:
            continue
        
        if dist > 1.0:
            # 渐变边缘：概率替换
            prob = 1.0 - (dist - 1.0) / 0.3
            if np.random.random() > prob:
                continue
        
        # 强制替换
        raw[y, x] = ref_idx
        count += 1

print(f"Replaced {count} pixels")

# 验证
check = raw[int(cy-ry-5):int(cy+ry+5), int(cx-rx-5):int(cx+rx+5)]
for idx in sorted(np.unique(check)):
    cnt = np.sum(check == idx)
    print(f"  idx={idx}: brightness={pal[idx].mean():.0f} count={cnt}")

# 保存
result = Image.fromarray(raw)
result.putpalette(img.getpalette())
result.save(dst, 'PNG', optimize=True, transparency=img.info.get('transparency'))
print(f"\nDone! {os.path.getsize(dst):,} bytes")

# 生成对比图
comp_img = Image.open(dst).convert('RGBA')
bg = Image.new('RGBA', comp_img.size, (242, 242, 242, 255))
comp = Image.alpha_composite(bg, comp_img).convert('RGB')
# 裁剪+放大
crop = comp.crop((900, 0, 1280, 200))
crop = crop.resize((crop.width*4, crop.height*4), Image.NEAREST)
crop.save(r'c:\Users\joesyang\WorkBuddy\20260324104822\project-management\public\wm_result.png')
print("Saved comparison crop")
