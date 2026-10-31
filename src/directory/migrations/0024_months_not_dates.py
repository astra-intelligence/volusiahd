"""Season and enrollment become months, not dates (#36).

A listing is filled in once and rarely updated, so a date with a year goes
stale; a month stays true. Each date already entered keeps its month.

Written by hand: left to itself, Django would change the column type in place,
and SQLite would turn "2026-09-01" into the number 2026 rather than 9. So new
month columns are added, filled from the old dates, and then take their names.
"""

from django.db import migrations, models

FIELDS = ["season_start", "season_end", "enrollment_opens", "enrollment_closes"]
MODELS = ["program", "submission"]
MONTHS = [
    (1, "January"),
    (2, "February"),
    (3, "March"),
    (4, "April"),
    (5, "May"),
    (6, "June"),
    (7, "July"),
    (8, "August"),
    (9, "September"),
    (10, "October"),
    (11, "November"),
    (12, "December"),
]
HELP = {
    "season_start": "The month this season or term starts. Leave blank if they run "
    "year round or have not set one.",
}
LABELS = {"season_start": "first meeting", "season_end": "last meeting"}


def month_field(name):
    return models.PositiveSmallIntegerField(
        LABELS.get(name),
        null=True,
        blank=True,
        choices=MONTHS,
        help_text=HELP.get(name, ""),
    )


def copy_months(apps, schema_editor):
    for model_name in ["Program", "Submission"]:
        Model = apps.get_model("directory", model_name)
        for row in Model.objects.all().only("pk", *FIELDS):
            changed = []
            for name in FIELDS:
                value = getattr(row, name)
                if value is not None:
                    setattr(row, f"{name}_month", value.month)
                    changed.append(f"{name}_month")
            if changed:
                row.save(update_fields=changed)


class Migration(migrations.Migration):
    dependencies = [
        ("directory", "0023_provider_name_and_class_list"),
    ]

    operations = [
        *[
            migrations.AddField(model_name=model, name=f"{name}_month", field=month_field(name))
            for model in MODELS
            for name in FIELDS
        ],
        # Not reversible: the day and year are gone once copied.
        migrations.RunPython(copy_months, migrations.RunPython.noop),
        *[
            migrations.RemoveField(model_name=model, name=name)
            for model in MODELS
            for name in FIELDS
        ],
        *[
            migrations.RenameField(model_name=model, old_name=f"{name}_month", new_name=name)
            for model in MODELS
            for name in FIELDS
        ],
    ]
