#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
聚合 SKILL 脚本。
将 skills/*/run.py 聚合到 skills/bin/ 目录下，并重命名为 skill 名称。

用法：
    python aggregate_skills.py
"""
import os
import shutil
import stat
from pathlib import Path

SKILLS_DIR = Path(__file__).parent
SRC_DIR = SKILLS_DIR / "skills"
BIN_DIR = SRC_DIR / "bin"


def get_skills():
    """获取所有 skill 目录"""
    skills = []
    if not SRC_DIR.exists():
        print(f"目录不存在: {SRC_DIR}")
        return skills
    
    for item in SRC_DIR.iterdir():
        if item.is_dir() and not item.name.startswith("_") and item.name != "bin":
            run_py = item / "run.py"
            if run_py.exists():
                skills.append({
                    "name": item.name,
                    "src": run_py,
                    "dest": BIN_DIR / f"{item.name}.py",
                })
    return skills


def aggregate():
    """聚合所有 skill"""
    if not SRC_DIR.exists():
        print(f"源目录不存在: {SRC_DIR}")
        return
    
    BIN_DIR.mkdir(parents=True, exist_ok=True)
    
    skills = get_skills()
    if not skills:
        print("未找到任何 skill")
        return
    
    print(f"找到 {len(skills)} 个 skill:")
    for s in skills:
        print(f"  - {s['name']}")
    
    print(f"\n聚合到: {BIN_DIR}")
    
    for s in skills:
        dest = s["dest"]
        
        # 复制文件
        shutil.copy2(s["src"], dest)
        
        # 添加执行权限
        st = os.stat(dest)
        os.chmod(dest, st.st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        
        print(f"  ✓ {s['name']}")
    
    print(f"\n聚合完成！共 {len(skills)} 个 skill")
    print(f"\n使用方式：")
    print(f"  cd {SRC_DIR}")
    print(f"  ./bin/<skill-name> [args...]")
    print(f"  ./bin/im list")
    print(f"  ./bin/meeting create --subject '会议'")


def clean():
    """清理 bin 目录"""
    if BIN_DIR.exists():
        shutil.rmtree(BIN_DIR)
        print(f"已清理: {BIN_DIR}")
    else:
        print(f"目录不存在: {BIN_DIR}")


def main():
    import argparse
    parser = argparse.ArgumentParser(description="聚合 SKILL 脚本")
    parser.add_argument("--clean", action="store_true", help="清理 bin 目录")
    args = parser.parse_args()
    
    if args.clean:
        clean()
    else:
        aggregate()


if __name__ == "__main__":
    main()
