import { useState } from "react";
import { useGetMyProfile, useUpdateMyProfile, getGetMyProfileQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Briefcase, Mail, Phone, MapPin, Edit2, User, AlertCircle, Camera } from "lucide-react";
import { useRef } from "react";
import { useUpload } from "@workspace/object-storage-web";
import { photoSrc } from "@/lib/photo";

const updateProfileSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  personalEmail: z.string().email("Invalid email").nullable().optional().or(z.literal('')),
  residentialAddress: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  emergencyContact: z.object({
    name: z.string().optional(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  }).nullable().optional().superRefine((ec, ctx) => {
    if (!ec) return;
    const anyFilled = !!(ec.name || ec.relationship || ec.phone || ec.address);
    if (!anyFilled) return;
    if (!ec.name) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Name is required when adding an emergency contact" });
    if (!ec.relationship) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["relationship"], message: "Relationship is required when adding an emergency contact" });
    if (!ec.phone) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["phone"], message: "Phone is required when adding an emergency contact" });
  })
});

type ProfileFormValues = z.infer<typeof updateProfileSchema>;

export default function MyProfile() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetMyProfile();
  const updateProfile = useUpdateMyProfile();
  const [isEditing, setIsEditing] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload({
    onError: (err) => toast.error("Upload failed", { description: err.message }),
  });

  // Convert the picked image to a small JPEG before uploading. iPhone photos
  // are often HEIC, which most browsers can't display — converting to JPEG
  // guarantees the avatar renders everywhere and keeps uploads small.
  const toJpeg = async (file: File): Promise<File> => {
    try {
      // "from-image" applies EXIF orientation so portrait phone photos
      // aren't rotated after conversion.
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      if (!bitmap.width || !bitmap.height) return file;
      const MAX = 512;
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (!blob) return file;
      return new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
    } catch {
      // Browser couldn't decode this format; upload the original as-is.
      return file;
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
      toast.error("Please choose an image file.");
      return;
    }
    const converted = await toJpeg(file);
    if (converted === file && !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      toast.error(
        "This photo format isn't supported by your browser. Please choose a JPG or PNG image.",
      );
      return;
    }
    const res = await uploadFile(converted);
    if (!res) return;
    updateProfile.mutate(
      { data: { profilePhotoUrl: res.objectPath } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
          toast.success("Profile photo updated");
        },
        onError: () => toast.error("Failed to save profile photo"),
      },
    );
  };

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      phone: "",
      personalEmail: "",
      residentialAddress: "",
      state: "",
      city: "",
      emergencyContact: null,
    },
  });

  const handleEditClick = () => {
    if (profile) {
      form.reset({
        phone: profile.phone || "",
        personalEmail: profile.personalEmail || "",
        residentialAddress: profile.residentialAddress || "",
        state: profile.state || "",
        city: profile.city || "",
        emergencyContact: profile.emergencyContact || {
          name: "", relationship: "", phone: "", address: ""
        },
      });
      setIsEditing(true);
    }
  };

  const onSubmit = (data: ProfileFormValues) => {
    // Nullify empty string for personal email to conform to nullable string type
    const ec = data.emergencyContact;
    const ecFilled = !!(ec && (ec.name || ec.relationship || ec.phone || ec.address));
    const payload = {
      ...data,
      personalEmail: data.personalEmail || null,
      emergencyContact: ecFilled
        ? {
            name: ec!.name!,
            relationship: ec!.relationship!,
            phone: ec!.phone!,
            ...(ec!.address ? { address: ec.address } : {}),
          }
        : null,
    };

    updateProfile.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        toast.success("Profile updated successfully");
        setIsEditing(false);
      },
      onError: (err) => {
        toast.error("Failed to update profile", {
          description: err.data?.error || "Unknown error"
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage src={photoSrc(profile.profilePhotoUrl)} />
              <AvatarFallback className="text-xl">{profile.firstName[0]}{profile.lastName[0]}</AvatarFallback>
            </Avatar>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={isUploading || updateProfile.isPending}
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background shadow-sm disabled:opacity-60"
              title="Upload profile picture"
              aria-label="Upload profile picture"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{profile.fullName}</h1>
            <div className="text-muted-foreground flex items-center gap-2 mt-1">
              <Badge variant="outline">{profile.employeeCode}</Badge>
              {profile.employment.jobTitle}
            </div>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={handleEditClick} variant="outline">
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Your contact and personal details</CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit, (errors) => {
                      const first = Object.values(errors)[0] as any;
                      const message =
                        first?.message ||
                        first?.name?.message || first?.relationship?.message || first?.phone?.message ||
                        "Please fix the highlighted fields.";
                      toast.error("Can't save yet", { description: message });
                    })}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="personalEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Personal Email (Optional)</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="residentialAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Residential Address</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator className="my-4" />
                    <h3 className="text-sm font-medium">Emergency Contact</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="emergencyContact.name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Name</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="emergencyContact.relationship"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Relationship</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="emergencyContact.phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="emergencyContact.address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Address</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" type="button" onClick={() => setIsEditing(false)}>Cancel</Button>
                      <Button type="submit" disabled={updateProfile.isPending}>Save Changes</Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Full Name</p>
                      <p className="font-medium mt-1">{[profile.firstName, profile.otherName, profile.lastName].filter(Boolean).join(" ")}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Gender</p>
                      <p className="font-medium mt-1">{profile.gender || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date of Birth</p>
                      <p className="font-medium mt-1">{profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Nationality</p>
                      <p className="font-medium mt-1">{profile.nationality || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Phone</p>
                      <p className="font-medium mt-1">{profile.phone}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Personal Email</p>
                      <p className="font-medium mt-1">{profile.personalEmail || "Not provided"}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Address</p>
                      <p className="font-medium mt-1">
                        {[profile.residentialAddress, profile.city, profile.state].filter(Boolean).join(", ") || "Not provided"}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-medium mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-muted-foreground" /> Emergency Contact</h3>
                    {profile.emergencyContact ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                        <div>
                          <p className="text-sm text-muted-foreground">Name</p>
                          <p className="font-medium mt-1">{profile.emergencyContact.name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Relationship</p>
                          <p className="font-medium mt-1">{profile.emergencyContact.relationship}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <p className="font-medium mt-1">{profile.emergencyContact.phone}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Address</p>
                          <p className="font-medium mt-1">{profile.emergencyContact.address}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No emergency contact provided.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Employment Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Company Email</p>
                <p className="font-medium">{profile.companyEmail}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="mt-1">
                  <Badge variant="outline" className={profile.employment.employmentStatus === 'active' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""}>
                    {profile.employment.employmentStatus}
                  </Badge>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> Employment Type</p>
                <p className="font-medium mt-1 capitalize">{profile.employment.employmentType?.replace('_', ' ') || "N/A"}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Start Date</p>
                <p className="font-medium mt-1">{profile.employment.startDate ? new Date(profile.employment.startDate).toLocaleDateString() : "N/A"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
