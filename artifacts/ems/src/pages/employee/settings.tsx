import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyProfile,
  useChangeMyPassword,
  useUpdateMyProfile,
  getGetMyProfileQueryKey,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Settings } from "lucide-react";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function EmployeeSettings() {
  const queryClient = useQueryClient();
  const { data: profile } = useGetMyProfile();
  const changePassword = useChangeMyPassword();
  const updateProfile = useUpdateMyProfile();

  const [photoUrl, setPhotoUrl] = useState("");

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmitPassword = (data: PasswordFormValues) => {
    changePassword.mutate(
      {
        data: {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword,
        },
      },
      {
        onSuccess: () => {
          toast.success("Password changed successfully");
          form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
        },
        onError: (err) => {
          toast.error("Failed to change password", {
            description: err.data?.error || "Unknown error",
          });
        },
      }
    );
  };

  const handleSavePhoto = () => {
    if (!photoUrl.trim()) {
      toast.error("Photo URL required", { description: "Enter a valid image URL." });
      return;
    }
    updateProfile.mutate(
      { data: { profilePhotoUrl: photoUrl.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          toast.success("Profile photo updated");
          setPhotoUrl("");
        },
        onError: (err) => {
          toast.error("Failed to update photo", {
            description: err.data?.error || "Unknown error",
          });
        },
      }
    );
  };

  const previewUrl = photoUrl.trim() || profile?.profilePhotoUrl || undefined;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-7 w-7 text-muted-foreground" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Manage your account and profile photo.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitPassword)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={changePassword.isPending}>
                  Change Password
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>Set your profile photo using an image URL.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage src={previewUrl} />
              <AvatarFallback className="text-xl">
                {profile ? `${profile.firstName[0]}${profile.lastName[0]}` : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="photo-url">Photo URL</Label>
              <Input
                id="photo-url"
                placeholder="https://example.com/photo.jpg"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSavePhoto} disabled={updateProfile.isPending}>
              Save Photo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
