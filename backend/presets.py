"""
Preset tabletop sample images for instant, reliable demo testing without a live webcam.
Generates clean 640x480 tabletop benchmark frames with shapes representing typical target objects.
"""

from __future__ import annotations

import base64
import io
from PIL import Image, ImageDraw, ImageFont


def _draw_tabletop_scene(objects: list[dict]) -> str:
    """
    Draw a clean 640x480 synthetic tabletop scene with objects and return base64 JPEG.
    objects: list of dicts with 'label', 'box' (x1, y1, x2, y2 px), 'color'
    """
    img = Image.new("RGB", (640, 480), (235, 230, 220)) # Wood/tabletop tint
    draw = ImageDraw.Draw(img)

    # Draw subtle table grid lines
    for x in range(0, 640, 40):
        draw.line([(x, 0), (x, 480)], fill=(220, 215, 205), width=1)
    for y in range(0, 480, 40):
        draw.line([(0, y), (640, y)], fill=(220, 215, 205), width=1)

    # Draw objects
    for obj in objects:
        x1, y1, x2, y2 = obj["box"]
        color = obj["color"]
        label = obj["label"]

        # Drop shadow
        draw.ellipse([x1+8, y2-15, x2+12, y2+10], fill=(180, 175, 165))
        
        # Object shape
        if obj.get("shape") == "ellipse":
            draw.ellipse([x1, y1, x2, y2], fill=color, outline=(40, 40, 40), width=3)
        else:
            draw.rounded_rectangle([x1, y1, x2, y2], radius=12, fill=color, outline=(40, 40, 40), width=3)

        # Label text on image
        draw.rectangle([x1, y1-20, x1+len(label)*10+12, y1], fill=(40, 40, 40))
        draw.text((x1+6, y1-16), label, fill=(255, 255, 255))

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


PRESET_SCENES = [
    {
        "id": "cup_and_bottle",
        "title": "Tabletop: Cup & Water Bottle",
        "description": "Standard robotics tabletop scenario with a ceramic cup and water bottle.",
        "image": _draw_tabletop_scene([
            {"label": "cup", "box": (200, 160, 320, 280), "color": (220, 80, 70), "shape": "ellipse"},
            {"label": "bottle", "box": (400, 100, 490, 360), "color": (60, 140, 220), "shape": "rectangle"},
        ])
    },
    {
        "id": "workbench_tools",
        "title": "Industrial: Workbench Tools",
        "description": "Gripper bin-picking test with scissors and small tool containers.",
        "image": _draw_tabletop_scene([
            {"label": "scissors", "box": (150, 200, 300, 320), "color": (160, 80, 200), "shape": "rectangle"},
            {"label": "bottle", "box": (380, 150, 470, 340), "color": (40, 180, 120), "shape": "rectangle"},
        ])
    },
    {
        "id": "desk_items",
        "title": "Office: Desk Items",
        "description": "Multi-object desktop layout suitable for candidate ranking and collision tests.",
        "image": _draw_tabletop_scene([
            {"label": "cup", "box": (120, 140, 230, 260), "color": (240, 160, 40), "shape": "ellipse"},
            {"label": "mouse", "box": (280, 220, 380, 320), "color": (70, 80, 95), "shape": "rectangle"},
            {"label": "bottle", "box": (440, 120, 530, 340), "color": (50, 160, 220), "shape": "rectangle"},
        ])
    }
]
