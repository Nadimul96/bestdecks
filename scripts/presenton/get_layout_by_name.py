from fastapi import HTTPException

from models.presentation_layout import PresentationLayoutModel


IMAGE_SCHEMA = {
    "type": "object",
    "required": ["__image_url__", "__image_prompt__"],
    "properties": {
        "__image_url__": {
            "type": "string",
            "format": "uri",
            "description": "URL to image",
        },
        "__image_prompt__": {
            "type": "string",
            "description": "Prompt used to generate the image",
        },
    },
}

ICON_SCHEMA = {
    "type": "object",
    "required": ["__icon_url__", "__icon_query__"],
    "properties": {
        "__icon_url__": {
            "type": "string",
            "description": "URL to icon",
        },
        "__icon_query__": {
            "type": "string",
            "description": "Query used to search the icon",
        },
    },
}


def build_slide(slide_id: str, name: str, description: str, schema: dict):
    return {
        "id": slide_id,
        "name": name,
        "description": description,
        "json_schema": schema,
    }


def build_default_slides(prefix: str):
    return [
        build_slide(
            prefix + "general-intro-slide",
            "Intro Slide",
            "Opening slide with title, description, presenter information, and supporting image.",
            {
                "type": "object",
                "required": [
                    "title",
                    "description",
                    "presenterName",
                    "presentationDate",
                    "image",
                ],
                "properties": {
                    "title": {"type": "string", "maxLength": 80},
                    "description": {"type": "string", "maxLength": 220},
                    "presenterName": {"type": "string", "maxLength": 60},
                    "presentationDate": {"type": "string", "maxLength": 40},
                    "image": IMAGE_SCHEMA,
                },
            },
        ),
        build_slide(
            prefix + "basic-info-slide",
            "Basic Info",
            "Title, description, and supporting image for a concise company summary.",
            {
                "type": "object",
                "required": ["title", "description", "image"],
                "properties": {
                    "title": {"type": "string", "maxLength": 80},
                    "description": {"type": "string", "maxLength": 240},
                    "image": IMAGE_SCHEMA,
                },
            },
        ),
        build_slide(
            prefix + "bullet-with-icons-slide",
            "Bullet with Icons",
            "Title, description, image, and two or three icon-backed bullets.",
            {
                "type": "object",
                "required": ["title", "description", "image", "bulletPoints"],
                "properties": {
                    "title": {"type": "string", "maxLength": 80},
                    "description": {"type": "string", "maxLength": 220},
                    "image": IMAGE_SCHEMA,
                    "bulletPoints": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 3,
                        "items": {
                            "type": "object",
                            "required": ["title", "description", "icon"],
                            "properties": {
                                "title": {"type": "string", "maxLength": 80},
                                "description": {"type": "string", "maxLength": 140},
                                "icon": ICON_SCHEMA,
                            },
                        },
                    },
                },
            },
        ),
        build_slide(
            prefix + "numbered-bullets-slide",
            "Numbered Bullets",
            "Title, image, and ranked bullets with short explanations.",
            {
                "type": "object",
                "required": ["title", "image", "bulletPoints"],
                "properties": {
                    "title": {"type": "string", "maxLength": 80},
                    "image": IMAGE_SCHEMA,
                    "bulletPoints": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 4,
                        "items": {
                            "type": "object",
                            "required": ["title", "description"],
                            "properties": {
                                "title": {"type": "string", "maxLength": 80},
                                "description": {"type": "string", "maxLength": 180},
                            },
                        },
                    },
                },
            },
        ),
        build_slide(
            prefix + "metrics-slide",
            "Metrics",
            "A metrics-focused slide with two or three numbers and explanations.",
            {
                "type": "object",
                "required": ["title", "metrics"],
                "properties": {
                    "title": {"type": "string", "maxLength": 100},
                    "metrics": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 3,
                        "items": {
                            "type": "object",
                            "required": ["label", "value", "description"],
                            "properties": {
                                "label": {"type": "string", "maxLength": 60},
                                "value": {"type": "string", "maxLength": 16},
                                "description": {"type": "string", "maxLength": 180},
                            },
                        },
                    },
                },
            },
        ),
        build_slide(
            prefix + "quote-slide",
            "Quote",
            "Strong statement or testimonial with author and background image.",
            {
                "type": "object",
                "required": ["heading", "quote", "author", "backgroundImage"],
                "properties": {
                    "heading": {"type": "string", "maxLength": 80},
                    "quote": {"type": "string", "maxLength": 260},
                    "author": {"type": "string", "maxLength": 80},
                    "backgroundImage": IMAGE_SCHEMA,
                },
            },
        ),
    ]


async def get_layout_by_name(layout_name: str) -> PresentationLayoutModel:
    normalized = (layout_name or "general").lower()
    if normalized in {
        "general",
        "modern",
        "standard",
        "swift",
        "neo-general",
        "neo-modern",
        "neo-standard",
        "neo-swift",
    }:
        return PresentationLayoutModel(
            name=normalized,
            ordered=False,
            slides=build_default_slides("general:"),
        )

    raise HTTPException(status_code=404, detail=f"Template {layout_name!r} not found")
