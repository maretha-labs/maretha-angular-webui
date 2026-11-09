import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { AutofocusDirective } from 'app/directives/autofocus.directive';

@Component({
	selector: 'nx-password-dialog',
	imports: [ReactiveFormsModule, WebUiMessagePipe, AutofocusDirective],
	template: `<form [formGroup]="form" (ngSubmit)="save()">
		<div class="modal-header">
			<!-- Focus the title so password helpers wait for user input and Tab reaches the first field. -->
			<h3 id="password-dialog-title" tabindex="-1" [nxAutofocus]="true" [nxFocusAnyElement]="true">
				{{ 'userProfile.password.change' | webuiMessage: 'Change Password' }}
			</h3>
		</div>
		<div class="modal-body">
			<label for="password-old"
				>{{ 'userProfile.password.old' | webuiMessage: 'Old password' }} *</label
			><input
				id="password-old"
				class="form-control mb-3"
				type="password"
				autocomplete="current-password"
				formControlName="oldPassword"
			/>
			<label for="password-new"
				>{{ 'userProfile.password.new' | webuiMessage: 'New password' }} *</label
			><input
				id="password-new"
				class="form-control mb-3"
				type="password"
				autocomplete="new-password"
				formControlName="newPassword"
			/>
			<label for="password-confirm"
				>{{ 'userProfile.password.confirm' | webuiMessage: 'Confirm password' }} *</label
			><input
				id="password-confirm"
				class="form-control"
				type="password"
				autocomplete="new-password"
				formControlName="confirmPassword"
			/>
			@if (form.hasError('mismatch') && form.controls.confirmPassword.touched) {
				<p role="alert">
					{{ 'userProfile.password.noMatch' | webuiMessage: 'Passwords do not match.' }}
				</p>
			}
			@if (error) {
				<p role="alert">
					{{
						'userProfile.password.error'
							| webuiMessage: 'Could not change password. Check your old password and try again.'
					}}
				</p>
			}
		</div>
		<div class="modal-footer">
			<button
				type="button"
				class="btn btn-outline-primary me-auto"
				[disabled]="saving"
				(click)="close()"
			>
				{{ 'command.cancel' | webuiMessage: 'Cancel' }}</button
			><button type="submit" class="btn btn-primary" [disabled]="saving || form.invalid">
				{{ 'command.save.changes' | webuiMessage: 'Save Changes' }}
			</button>
		</div>
	</form>`,
	styles: `
		:host {
			display: block;
			color: var(--nuxeo-text-default);
			background: var(--nuxeo-box);
		}
		h3 {
			font-size: 1.2rem;
			margin: 0;
		}
		label {
			display: block;
		}
		p[role='alert'] {
			color: var(--nuxeo-warn-text, #b00020);
			margin-top: 8px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordDialogComponent {
	private readonly fb = inject(FormBuilder);
	private readonly auth = inject(AuthService);
	private readonly modal = inject(BsModalRef);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly destroyRef = inject(DestroyRef);
	readonly form = this.fb.nonNullable.group(
		{
			oldPassword: ['', Validators.required],
			newPassword: ['', Validators.required],
			confirmPassword: ['', Validators.required],
		},
		{
			validators: (control) =>
				control.get('newPassword')?.value === control.get('confirmPassword')?.value
					? null
					: { mismatch: true },
		},
	);
	saving = false;
	error = false;
	close(): void {
		if (!this.saving) this.modal.hide();
	}
	save(): void {
		this.form.markAllAsTouched();
		if (this.saving || this.form.invalid) return;
		this.saving = true;
		this.error = false;
		const { oldPassword, newPassword } = this.form.getRawValue();
		this.auth
			.changePassword(oldPassword, newPassword)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => this.modal.hide(),
				error: () => {
					this.saving = false;
					this.error = true;
					this.cdr.markForCheck();
				},
			});
	}
}
