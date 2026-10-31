import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return response({ error: "Método no permitido." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : authorization;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !supabaseUrl || !serviceRoleKey) {
    return response({ error: "No se pudo validar la sesión administrativa." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userResult, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userResult.user) {
    return response({ error: "La sesión no es válida o expiró." }, 401);
  }

  const { data: actor, error: actorError } = await adminClient
    .from("perfiles")
    .select("id, rol, id_empresa, id_sucursal, activo")
    .eq("id", userResult.user.id)
    .maybeSingle();
  if (actorError) {
    console.error("No se pudo validar el perfil administrativo:", actorError.message);
    return response({ error: "No se pudo validar el perfil administrativo." }, 500);
  }
  if (!actor?.activo || !["admin", "superadmin"].includes(actor.rol)) {
    return response({ error: "Solo admin y superadmin pueden gestionar estas cuentas." }, 403);
  }

  let payload: {
    action?: string;
    id_empleado?: number;
    id_sucursal?: number;
    email?: string;
    password?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return response({ error: "La solicitud no contiene datos válidos." }, 400);
  }

  const email = payload.email?.trim().toLowerCase();
  const emailParts = email?.split("@") || [];
  if (
    !email
    || email.length > 254
    || emailParts.length !== 2
    || !emailParts[0]
    || !emailParts[1]?.includes(".")
    || email.includes(" ")
  ) {
    return response({ error: "Escribe un correo electrónico válido." }, 400);
  }
  if (payload.password !== undefined && payload.password !== "" && payload.password.length < 12) {
    return response({ error: "La contraseña temporal debe tener al menos 12 caracteres." }, 400);
  }

  const action = payload.action;
  if (action === "create_kiosk") {
    if (actor.rol !== "superadmin") {
      return response({ error: "Solo un superadmin puede crear cuentas de kiosco." }, 403);
    }
    if (!Number.isSafeInteger(payload.id_sucursal) || Number(payload.id_sucursal) <= 0) {
      return response({ error: "Selecciona una sucursal válida." }, 400);
    }
    if (!payload.password || payload.password.length < 12) {
      return response({ error: "La contraseña temporal debe tener al menos 12 caracteres." }, 400);
    }

    const { data: branch, error: branchError } = await adminClient
      .from("sucursales")
      .select("id_empresa, id_sucursal, nombre, activa")
      .eq("id_sucursal", payload.id_sucursal)
      .maybeSingle();
    if (branchError) {
      console.error("No se pudo consultar la sucursal del kiosco:", branchError.message);
      return response({ error: "No se pudo validar la sucursal." }, 500);
    }
    if (!branch?.activa || (actor.id_empresa && branch.id_empresa !== actor.id_empresa)) {
      return response({ error: "La sucursal no existe, está inactiva o no pertenece a tu empresa." }, 400);
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        nombre_completo: `Kiosco de asistencia — ${branch.nombre}`,
        must_change_password: true,
      },
    });
    if (createError || !created.user) {
      return response({
        error: createError?.message.toLowerCase().includes("already")
          ? "Ya existe una cuenta con ese correo."
          : createError?.message || "No se pudo crear la cuenta del kiosco.",
      }, 400);
    }

    const { error: profileError } = await adminClient
      .from("perfiles")
      .update({
        nombre_completo: `Kiosco de asistencia — ${branch.nombre}`,
        email,
        rol: "asistencia",
        id_empresa: branch.id_empresa,
        id_sucursal: branch.id_sucursal,
        activo: true,
      })
      .eq("id", created.user.id);
    if (profileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      console.error("No se pudo configurar el perfil del kiosco:", profileError.message);
      return response({ error: "No se pudo configurar el perfil del kiosco." }, 500);
    }
    return response({ success: true, message: "Cuenta del kiosco creada para la sucursal." });
  }

  if (!Number.isSafeInteger(payload.id_empleado) || Number(payload.id_empleado) <= 0) {
    return response({ error: "El empleado seleccionado no es válido." }, 400);
  }

  const { data: employee, error: employeeError } = await adminClient
    .from("empleados")
    .select("id_empleado, id_empresa, id_sucursal, id_perfil, nombre_completo, telefono, id_puesto, estado")
    .eq("id_empleado", payload.id_empleado)
    .maybeSingle();
  if (employeeError) {
    console.error("No se pudo consultar el empleado:", employeeError.message);
    return response({ error: "No se pudo consultar el empleado." }, 500);
  }
  if (!employee) {
    return response({ error: "El empleado no existe." }, 404);
  }
  if (
    actor.rol !== "superadmin"
    && (actor.id_empresa !== employee.id_empresa || actor.id_sucursal !== employee.id_sucursal)
  ) {
    return response({ error: "No tienes permiso para gestionar empleados de esta sucursal." }, 403);
  }
  if (employee.estado !== "Activo") {
    return response({ error: "Solo se pueden gestionar cuentas de empleados activos." }, 400);
  }
  if (employee.id_perfil === actor.id) {
    return response({ error: "No puedes modificar tu propia cuenta desde la ficha del empleado." }, 403);
  }

  const { data: position, error: positionError } = await adminClient
    .from("puestos_empresa")
    .select("rol_acceso")
    .eq("id_empresa", employee.id_empresa)
    .eq("id_puesto", employee.id_puesto)
    .maybeSingle();
  if (positionError) {
    console.error("No se pudo validar el rol del puesto:", positionError.message);
    return response({ error: "No se pudo validar el rol del puesto." }, 500);
  }
  const employeeRole = position?.rol_acceso;
  const validRoles = ["admin", "gerente", "contador", "bodega", "cajero", "despacho"];
  if (!employeeRole || !validRoles.includes(employeeRole)) {
    return response({ error: "Asigna al empleado un puesto con un rol de acceso antes de crear su cuenta." }, 400);
  }
  if (employeeRole === "admin" && actor.rol !== "superadmin") {
    return response({ error: "Solo un superadmin puede crear cuentas de administrador." }, 403);
  }

  if (action === "create") {
    if (employee.id_perfil) {
      return response({ error: "Este empleado ya tiene una cuenta vinculada." }, 409);
    }
    if (!payload.password || payload.password.length < 12) {
      return response({ error: "La contraseña temporal debe tener al menos 12 caracteres." }, 400);
    }

    const { data: matchingProfiles, error: matchingProfilesError } = await adminClient
      .from("perfiles")
      .select("id, rol, id_empresa, id_sucursal")
      .eq("email", email)
      .limit(2);
    if (matchingProfilesError) {
      console.error("No se pudo buscar una cuenta existente por correo:", matchingProfilesError.message);
      return response({ error: "No se pudo validar si el correo ya tiene una cuenta." }, 500);
    }
    const profileMatches = matchingProfiles || [];
    if (profileMatches.length > 1) {
      return response({ error: "Hay varias cuentas con ese correo. Contacta al superadmin para resolverlo." }, 409);
    }

    let userId: string;
    let isNewUser = false;
    const existingProfile = profileMatches[0];
    if (existingProfile) {
      if (existingProfile.id === actor.id) {
        return response({ error: "No puedes convertir tu propia cuenta en una cuenta de empleado." }, 403);
      }
      if (
        existingProfile.rol === "superadmin"
        || existingProfile.rol === "asistencia"
        || (existingProfile.rol === "admin" && actor.rol !== "superadmin")
      ) {
        return response({ error: "Este correo ya pertenece a una cuenta administrativa que no se puede asignar al empleado." }, 403);
      }
      if (
        (existingProfile.id_empresa && existingProfile.id_empresa !== employee.id_empresa)
        || (existingProfile.id_sucursal && existingProfile.id_sucursal !== employee.id_sucursal)
      ) {
        return response({ error: "El correo ya está asociado a otra empresa o sucursal." }, 409);
      }

      const { data: linkedEmployees, error: linkedEmployeesError } = await adminClient
        .from("empleados")
        .select("id_empleado")
        .eq("id_perfil", existingProfile.id)
        .limit(1);
      if (linkedEmployeesError) {
        console.error("No se pudo comprobar si la cuenta está vinculada:", linkedEmployeesError.message);
        return response({ error: "No se pudo validar el vínculo de la cuenta existente." }, 500);
      }
      if (linkedEmployees?.length) {
        return response({ error: "La cuenta ya está vinculada a otro empleado." }, 409);
      }

      const { data: existingUser, error: existingUserError } =
        await adminClient.auth.admin.getUserById(existingProfile.id);
      if (existingUserError || !existingUser.user) {
        console.error("No se pudo obtener la cuenta Auth existente:", existingUserError?.message);
        return response({ error: "No se pudo validar la cuenta existente." }, 500);
      }
      const { error: updateUserError } = await adminClient.auth.admin.updateUserById(
        existingProfile.id,
        {
          email,
          email_confirm: true,
          password: payload.password,
          user_metadata: {
            ...existingUser.user.user_metadata,
            nombre_completo: employee.nombre_completo,
            telefono: employee.telefono,
            must_change_password: true,
          },
        },
      );
      if (updateUserError) {
        return response({ error: updateUserError.message }, 400);
      }
      userId = existingProfile.id;
    } else {
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
          nombre_completo: employee.nombre_completo,
          telefono: employee.telefono,
          must_change_password: true,
        },
      });
      if (createError || !created.user) {
        return response({
          error: createError?.message.toLowerCase().includes("already")
            ? "Ya existe una cuenta con ese correo, pero no se encontró su perfil. Contacta al superadmin."
            : createError?.message || "No se pudo crear la cuenta.",
        }, 400);
      }
      userId = created.user.id;
      isNewUser = true;
    }

    const { error: profileError } = await adminClient
      .from("perfiles")
      .update({
        nombre_completo: employee.nombre_completo,
        email,
        telefono: employee.telefono,
        rol: employeeRole,
        id_empresa: employee.id_empresa,
        id_sucursal: employee.id_sucursal,
        activo: true,
      })
      .eq("id", userId);
    if (profileError) {
      if (isNewUser) {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
        if (deleteError) console.error("No se pudo limpiar la cuenta tras un error de perfil:", deleteError.message);
      }
      console.error("No se pudo preparar el perfil de la cuenta:", profileError.message);
      return response({ error: "Se creó la cuenta, pero no se pudo asignar el perfil. Intenta nuevamente." }, 500);
    }

    const { data: linkedEmployee, error: linkError } = await adminClient
      .from("empleados")
      .update({ id_perfil: userId, email })
      .eq("id_empleado", employee.id_empleado)
      .is("id_perfil", null)
      .select("id_empleado")
      .maybeSingle();
    if (linkError || !linkedEmployee) {
      if (isNewUser) {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
        if (deleteError) console.error("No se pudo limpiar la cuenta creada tras un error de vinculación:", deleteError.message);
      }
      console.error("No se pudo vincular la cuenta al empleado:", linkError?.message || "El empleado ya tiene una cuenta vinculada.");
      return response({ error: "No se pudo vincular la cuenta al empleado." }, 500);
    }

    return response({
      success: true,
      message: isNewUser
        ? "Cuenta creada y vinculada al empleado."
        : "Cuenta existente actualizada y vinculada al empleado.",
    });
  }

  if (action !== "update") {
    return response({ error: "La acción solicitada no es válida." }, 400);
  }
  if (!employee.id_perfil) {
    return response({ error: "Este empleado todavía no tiene una cuenta vinculada." }, 400);
  }

  const { data: linkedProfile, error: linkedProfileError } = await adminClient
    .from("perfiles")
    .select("id, rol")
    .eq("id", employee.id_perfil)
    .maybeSingle();
  if (linkedProfileError) {
    console.error("No se pudo consultar la cuenta vinculada:", linkedProfileError.message);
    return response({ error: "No se pudo consultar la cuenta vinculada." }, 500);
  }
  if (!linkedProfile) {
    return response({ error: "No se encontró la cuenta vinculada al empleado." }, 404);
  }
  if (linkedProfile.rol === "superadmin" || linkedProfile.rol === "asistencia") {
    return response({ error: "Este tipo de cuenta no se puede administrar desde la ficha del empleado." }, 403);
  }
  if (linkedProfile.rol === "admin" && actor.rol !== "superadmin") {
    return response({ error: "Solo un superadmin puede modificar una cuenta administradora." }, 403);
  }

  const { data: linkedUserData, error: linkedUserError } =
    await adminClient.auth.admin.getUserById(employee.id_perfil);
  if (linkedUserError || !linkedUserData.user) {
    return response({ error: "No se pudo consultar la cuenta de Auth vinculada." }, 500);
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.updateUserById(
    employee.id_perfil,
    {
      email,
      email_confirm: true,
      ...(payload.password ? {
        password: payload.password,
        user_metadata: {
          ...linkedUserData.user.user_metadata,
          nombre_completo: employee.nombre_completo,
          telefono: employee.telefono,
          must_change_password: true,
        },
      } : {}),
    },
  );
  if (authError || !authData.user) {
    return response({ error: authError?.message || "No se pudo actualizar la cuenta." }, 400);
  }

  const { error: profileUpdateError } = await adminClient
    .from("perfiles")
    .update({ email, nombre_completo: employee.nombre_completo, telefono: employee.telefono })
    .eq("id", employee.id_perfil);
  if (profileUpdateError) {
    console.error("No se pudo sincronizar el correo del perfil:", profileUpdateError.message);
    return response({ error: "La cuenta se actualizó, pero no se pudo sincronizar el perfil." }, 500);
  }

  const { error: employeeUpdateError } = await adminClient
    .from("empleados")
    .update({ email })
    .eq("id_empleado", employee.id_empleado);
  if (employeeUpdateError) {
    console.error("No se pudo sincronizar el correo del empleado:", employeeUpdateError.message);
    return response({ error: "La cuenta se actualizó, pero no se pudo sincronizar la ficha del empleado." }, 500);
  }

  return response({
    success: true,
    message: payload.password
      ? "Correo y contraseña temporal actualizados."
      : "Correo de acceso actualizado.",
  });
});
