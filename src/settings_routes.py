"""
Settings routes
================
Account settings (profile, password) plus membership management for
the currently active group: leave the group, regenerate its invite
code (admin only), remove a member (admin only).
"""

from flask import Blueprint, abort, flash, redirect, render_template, session, url_for
from flask_login import current_user, login_required

from src.forms import (
    ChangePasswordForm,
    InviteRegenerateForm,
    LeaveGroupForm,
    ProfileForm,
    RemoveMemberForm,
)
from src.group_access import get_active_membership
from src.models import GroupMembership, db

bp = Blueprint("settings", __name__, url_prefix="/settings")


@bp.route("/", methods=["GET"])
@login_required
def index():
    membership = get_active_membership()
    profile_form = ProfileForm(name=current_user.name)
    password_form = ChangePasswordForm()
    invite_form = InviteRegenerateForm()
    leave_form = LeaveGroupForm()
    remove_form = RemoveMemberForm()

    group_members = []
    if membership:
        group_members = (
            GroupMembership.query.filter_by(group_id=membership.group_id)
            .order_by(GroupMembership.joined_at.asc())
            .all()
        )

    return render_template(
        "settings.html",
        membership=membership,
        group_members=group_members,
        profile_form=profile_form,
        password_form=password_form,
        invite_form=invite_form,
        leave_form=leave_form,
        remove_form=remove_form,
    )


@bp.route("/profile", methods=["POST"])
@login_required
def update_profile():
    form = ProfileForm()
    if form.validate_on_submit():
        current_user.name = form.name.data.strip()
        db.session.commit()
        flash("Profile updated.", "success")
    else:
        for errors in form.errors.values():
            for err in errors:
                flash(err, "error")
    return redirect(url_for("settings.index"))


@bp.route("/password", methods=["POST"])
@login_required
def change_password():
    form = ChangePasswordForm()
    if form.validate_on_submit():
        if not current_user.check_password(form.current_password.data):
            flash("Current password is incorrect.", "error")
        else:
            current_user.set_password(form.new_password.data)
            db.session.commit()
            flash("Password changed.", "success")
    else:
        for errors in form.errors.values():
            for err in errors:
                flash(err, "error")
    return redirect(url_for("settings.index"))


@bp.route("/group/invite/regenerate", methods=["POST"])
@login_required
def regenerate_invite():
    membership = get_active_membership()
    if membership is None or membership.role != "admin":
        abort(403)

    form = InviteRegenerateForm()
    if form.validate_on_submit():
        new_code = membership.group.regenerate_invite_code()
        db.session.commit()
        flash(f"New invite code: {new_code}", "success")
    return redirect(url_for("settings.index"))


@bp.route("/group/leave", methods=["POST"])
@login_required
def leave_group():
    membership = get_active_membership()
    if membership is None:
        abort(403)

    form = LeaveGroupForm()
    if not form.validate_on_submit():
        return redirect(url_for("settings.index"))

    group_name = membership.group.name
    group_id = membership.group_id

    if membership.role == "admin":
        other_admins = GroupMembership.query.filter_by(group_id=group_id, role="admin").filter(
            GroupMembership.user_id != current_user.id
        ).count()
        remaining_members = GroupMembership.query.filter_by(group_id=group_id).filter(
            GroupMembership.user_id != current_user.id
        ).count()
        if other_admins == 0 and remaining_members > 0:
            flash("Promote another member to admin before you leave.", "error")
            return redirect(url_for("settings.index"))

    db.session.delete(membership)
    db.session.commit()
    session.pop("active_group_id", None)
    flash(f"Left '{group_name}'.", "success")
    return redirect(url_for("groups.index"))


@bp.route("/group/members/remove", methods=["POST"])
@login_required
def remove_member():
    membership = get_active_membership()
    if membership is None or membership.role != "admin":
        abort(403)

    form = RemoveMemberForm()
    if not form.validate_on_submit():
        return redirect(url_for("settings.index"))

    try:
        target_user_id = int(form.member_user_id.data)
    except (TypeError, ValueError):
        abort(400)

    if target_user_id == current_user.id:
        flash("Use 'Leave group' to remove yourself.", "error")
        return redirect(url_for("settings.index"))

    target = GroupMembership.query.filter_by(user_id=target_user_id, group_id=membership.group_id).first()
    if target is None:
        abort(404)

    db.session.delete(target)
    db.session.commit()
    flash("Member removed.", "success")
    return redirect(url_for("settings.index"))
