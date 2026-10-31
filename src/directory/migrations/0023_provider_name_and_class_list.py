"""One listing per provider, with its classes listed (#33, #34).

"Host or group name" is removed: the listing's own name is now the provider
or business. Anything already typed into it is kept by adding "Part of …" to
the end of the description, the same line the program page used to show, so
nothing a provider wrote is lost.

"Classes offered" becomes a text field, since one provider can run many.
"""

from django.db import migrations, models
from django.utils.html import escape


def keep_host_names(apps, schema_editor):
    Program = apps.get_model("directory", "Program")
    Submission = apps.get_model("directory", "Submission")

    for program in Program.objects.exclude(host_name=""):
        line = f"<p>Part of {escape(program.host_name.strip())}.</p>"
        program.description = (program.description or "") + line
        program.save(update_fields=["description"])

    for submission in Submission.objects.exclude(host_name=""):
        parts = [submission.description.strip(), f"Part of {submission.host_name.strip()}."]
        submission.description = "\n\n".join(part for part in parts if part)
        submission.save(update_fields=["description"])


class Migration(migrations.Migration):
    dependencies = [
        ("directory", "0022_tag_suggestions"),
    ]

    operations = [
        # Not reversible usefully: once merged, the line can't be told apart.
        migrations.RunPython(keep_host_names, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="program",
            name="host_name",
        ),
        migrations.RemoveField(
            model_name="submission",
            name="host_name",
        ),
        migrations.AlterField(
            model_name="program",
            name="class_names",
            field=models.TextField(
                blank=True,
                help_text="Every class or activity they offer, separated by commas — e.g. 'Beginners Spanish, Spanish II, Conversation club'.",
                verbose_name="classes offered",
            ),
        ),
        migrations.AlterField(
            model_name="program",
            name="name",
            field=models.CharField(max_length=160, verbose_name="provider/business name"),
        ),
        migrations.AlterField(
            model_name="submission",
            name="class_names",
            field=models.TextField(
                blank=True,
                help_text="Every class or activity they offer, separated by commas — e.g. 'Beginners Spanish, Spanish II, Conversation club'.",
                verbose_name="classes offered",
            ),
        ),
        migrations.AlterField(
            model_name="submission",
            name="program_name",
            field=models.CharField(max_length=160, verbose_name="provider/business name"),
        ),
    ]
