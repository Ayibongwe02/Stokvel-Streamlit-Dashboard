"""
Forms
=====
Flask-WTF forms. Using WTForms (rather than raw HTML forms) is what
gives every POST endpoint CSRF protection for free via Flask-WTF's
CSRFProtect + the hidden {{ form.csrf_token }} field rendered in each
template.
"""

from flask_wtf import FlaskForm
from flask_wtf.file import FileAllowed, FileField
from wtforms import PasswordField, SelectField, StringField, SubmitField
from wtforms.validators import DataRequired, Email, EqualTo, Length, Optional, Regexp


class SignupForm(FlaskForm):
    name = StringField("Full name", validators=[DataRequired(), Length(max=120)])
    email = StringField("Email", validators=[DataRequired(), Email(), Length(max=255)])
    password = PasswordField("Password", validators=[DataRequired(), Length(min=8, max=128)])
    confirm_password = PasswordField(
        "Confirm password", validators=[DataRequired(), EqualTo("password", message="Passwords must match.")]
    )
    submit = SubmitField("Create account")


class LoginForm(FlaskForm):
    email = StringField("Email", validators=[DataRequired(), Email(), Length(max=255)])
    password = PasswordField("Password", validators=[DataRequired()])
    submit = SubmitField("Log in")


class GroupCreateForm(FlaskForm):
    name = StringField("Group name", validators=[DataRequired(), Length(max=150)])
    region = StringField("Region", validators=[Optional(), Length(max=120)])
    submit = SubmitField("Create group")


class GroupJoinForm(FlaskForm):
    invite_code = StringField(
        "Invite code",
        validators=[
            DataRequired(),
            Length(min=4, max=16),
            Regexp(r"^[A-Za-z0-9]+$", message="Letters and digits only."),
        ],
    )
    submit = SubmitField("Join group")


class ProfileForm(FlaskForm):
    name = StringField("Full name", validators=[DataRequired(), Length(max=120)])
    submit = SubmitField("Save changes")


class ChangePasswordForm(FlaskForm):
    current_password = PasswordField("Current password", validators=[DataRequired()])
    new_password = PasswordField("New password", validators=[DataRequired(), Length(min=8, max=128)])
    confirm_password = PasswordField(
        "Confirm new password", validators=[DataRequired(), EqualTo("new_password", message="Passwords must match.")]
    )
    submit = SubmitField("Change password")


class InviteRegenerateForm(FlaskForm):
    submit = SubmitField("Regenerate invite code")


class LeaveGroupForm(FlaskForm):
    submit = SubmitField("Leave group")


class RemoveMemberForm(FlaskForm):
    member_user_id = StringField(validators=[DataRequired()])
    submit = SubmitField("Remove")


class UploadForm(FlaskForm):
    tx_file = FileField("Transactions CSV", validators=[Optional(), FileAllowed(["csv"], "CSV files only.")])
    hist_file = FileField(
        "Historical forecast CSV (optional)", validators=[Optional(), FileAllowed(["csv"], "CSV files only.")]
    )
    submit = SubmitField("Upload")


class ResetDataForm(FlaskForm):
    submit = SubmitField("Reset to sample data")


class GroupSwitchForm(FlaskForm):
    group_id = SelectField("Active group", coerce=int)
    submit = SubmitField("Switch")
